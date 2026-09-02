import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, ipcMain, Menu, nativeImage, powerMonitor, screen, Tray } from 'electron'

type HabitatState = {
  seed: number
  quiet: boolean
  trust: number
  encounters: number
  bench: boolean
  discoveries: number
  presenceAware: boolean
}

const DEFAULT_STATE: HabitatState = {
  seed: 0,
  quiet: false,
  trust: 0.18,
  encounters: 0,
  bench: false,
  discoveries: 0,
  presenceAware: true,
}
const WINDOW_WIDTH = 240
const WINDOW_HEIGHT = 280
const HIT_TEST_INTERVAL_MS = 40
const WALK_INTERVAL_MS = 60
const DRAG_INTERVAL_MS = 16
const PRESENCE_INTERVAL_MS = 15_000
const OWNER_AWAY_SECONDS = 4 * 60
const CAPTURE_ACTIVITIES = new Set([
  'settle',
  'observe',
  'stroll',
  'preen',
  'doze',
  'delight',
  'startle',
])

let window: BrowserWindow | null = null
let tray: Tray | null = null
let state: HabitatState = DEFAULT_STATE
let quitting = false
let hitTestSequence = 0
let lastHitTestResult = 0
let ignoringMouse = false
let motionDirection: -1 | 0 | 1 = 0
let dragOffset: { x: number; y: number } | null = null
let ownerAway = false

const isNativeWayland =
  process.platform === 'linux' &&
  (process.env.XDG_SESSION_TYPE === 'wayland' || process.env.WAYLAND_DISPLAY !== undefined)

const canMoveWindow =
  process.env.HABITAT_CAPTURE_ACTIVITY === undefined &&
  !isNativeWayland

const canObservePresence = process.env.HABITAT_DISABLE_PRESENCE === undefined

// Linux does not support Electron's forwarded mouse-move option, so toggling a
// transparent window from ignored back to interactive can leave X11 targeting
// the window underneath until the pointer moves again. Keep the compact Linux
// window interactive; Windows and macOS retain transparent-area passthrough.
const canPassThroughMouse = process.platform !== 'linux'

function statePath(): string {
  return join(app.getPath('userData'), 'habitat.json')
}

function readState(): HabitatState {
  try {
    const parsed = JSON.parse(readFileSync(statePath(), 'utf8')) as Partial<HabitatState>
    return {
      seed: Number.isInteger(parsed.seed) && parsed.seed !== 0 ? parsed.seed! >>> 0 : freshSeed(),
      quiet: parsed.quiet === true,
      trust: finiteBetween(parsed.trust, 0, 1, DEFAULT_STATE.trust),
      encounters: finiteIntegerBetween(parsed.encounters, 0, Number.MAX_SAFE_INTEGER, 0),
      bench: parsed.bench === true,
      discoveries: finiteIntegerBetween(parsed.discoveries, 0, 0b111, 0),
      presenceAware: parsed.presenceAware !== false,
    }
  } catch {
    return { ...DEFAULT_STATE, seed: freshSeed() }
  }
}

function finiteBetween(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

function finiteIntegerBetween(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback
}

function freshSeed(): number {
  return randomBytes(4).readUInt32LE(0) || 1
}

function saveState(): void {
  const path = statePath()
  const temporary = `${path}.new`
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  renameSync(temporary, path)
}

function homeBounds(): Electron.Rectangle {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  return {
    x: display.workArea.x + display.workArea.width - WINDOW_WIDTH - 7,
    y: display.workArea.y + display.workArea.height - WINDOW_HEIGHT - 5,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
  }
}

function appIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'resources', 'icon.png')
}

function createWindow(): void {
  const bounds = homeBounds()
  window = new BrowserWindow({
    ...bounds,
    title: 'Microduck Habitat',
    icon: appIconPath(),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  window.setAlwaysOnTop(true, process.platform === 'darwin' ? 'floating' : 'normal')
  if (process.platform === 'darwin') {
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.once('ready-to-show', () => showWindow(false))
  window.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      hideWindow()
    }
  })
  window.on('closed', () => {
    window = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    const activity = captureActivity()
    if (activity) url.searchParams.set('activity', activity)
    void window.loadURL(url.toString())
  } else {
    const activity = captureActivity()
    void window.loadFile(
      join(__dirname, '../renderer/index.html'),
      activity ? { query: { activity } } : undefined,
    )
  }
}

function captureActivity(): string | null {
  const value = process.env.HABITAT_CAPTURE_ACTIVITY
  return value && CAPTURE_ACTIVITIES.has(value) ? value : null
}

function showWindow(activate = true): void {
  if (!window) createWindow()
  if (!window) return
  applyMousePassthrough(false)
  if (activate) {
    window.show()
    window.focus()
  } else {
    window.showInactive()
  }
}

function hideWindow(): void {
  motionDirection = 0
  dragOffset = null
  window?.hide()
}

function applyMousePassthrough(ignore: boolean): void {
  const next = canPassThroughMouse && ignore
  if (!window || window.isDestroyed() || next === ignoringMouse) return
  ignoringMouse = next
  window.setIgnoreMouseEvents(next, next ? { forward: true } : undefined)
}

function pollMouseHitTest(): void {
  if (!window || window.isDestroyed() || !window.isVisible() || dragOffset) return
  const point = screen.getCursorScreenPoint()
  const bounds = window.getBounds()
  const x = point.x - bounds.x
  const y = point.y - bounds.y
  if (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height) {
    applyMousePassthrough(true)
    return
  }
  const sequence = ++hitTestSequence
  window.webContents.send('habitat:hit-test', { sequence, x, y })
}

function walkDesktop(): void {
  if (!canMoveWindow || motionDirection === 0 || !window?.isVisible() || dragOffset) return
  const bounds = window.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const minimum = display.workArea.x
  const maximum = display.workArea.x + display.workArea.width - bounds.width
  const nextX = Math.min(maximum, Math.max(minimum, bounds.x + motionDirection))
  if (nextX === bounds.x) {
    const edgeDirection = motionDirection
    motionDirection = 0
    window.webContents.send('habitat:edge', edgeDirection)
    return
  }
  window.setPosition(nextX, bounds.y, false)
}

function dragTick(): void {
  if (!dragOffset || !window || window.isDestroyed() || !window.isVisible()) return
  const point = screen.getCursorScreenPoint()
  window.setPosition(point.x - dragOffset.x, point.y - dragOffset.y, false)
}

function setOwnerAway(away: boolean): void {
  const next = canObservePresence && state.presenceAware ? away : false
  if (next === ownerAway) return
  ownerAway = next
  window?.webContents.send('habitat:owner-presence', !ownerAway)
}

function pollOwnerPresence(): void {
  if (!canObservePresence || !state.presenceAware) return
  try {
    setOwnerAway(powerMonitor.getSystemIdleTime() >= OWNER_AWAY_SECONDS)
  } catch {
    setOwnerAway(false)
  }
}

function createTray(): void {
  const source = nativeImage.createFromPath(appIconPath())
  if (source.isEmpty()) return
  const icon = source.resize({ width: process.platform === 'darwin' ? 20 : 22, height: process.platform === 'darwin' ? 20 : 22 })
  tray = new Tray(icon)
  tray.setToolTip('Microduck Habitat')
  tray.on('click', () => showWindow())
  rebuildTrayMenu()
}

function rebuildTrayMenu(): void {
  if (!tray) return
  const launchAtLogin = app.isPackaged && app.getLoginItemSettings().openAtLogin
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Microduck', click: () => showWindow() },
      { type: 'separator' },
      {
        label: 'Quiet mode',
        type: 'checkbox',
        checked: state.quiet,
        click: (item) => {
          state.quiet = item.checked
          saveState()
          window?.webContents.send('habitat:quiet-changed', state.quiet)
          rebuildTrayMenu()
        },
      },
      {
        label: 'Respond to idle time',
        type: 'checkbox',
        checked: state.presenceAware,
        click: (item) => {
          state.presenceAware = item.checked
          saveState()
          if (item.checked) pollOwnerPresence()
          else setOwnerAway(false)
          rebuildTrayMenu()
        },
      },
      {
        label: 'Launch at login',
        type: 'checkbox',
        checked: launchAtLogin,
        enabled: app.isPackaged,
        click: (item) => {
          app.setLoginItemSettings({ openAtLogin: item.checked })
          rebuildTrayMenu()
        },
      },
      { label: 'Return home', click: () => window?.setBounds(homeBounds(), true) },
      { type: 'separator' },
      {
        label: 'Quit Microduck Habitat',
        click: () => {
          quitting = true
          app.quit()
        },
      },
    ]),
  )
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
  app.whenReady().then(() => {
    state = readState()
    if (canObservePresence && state.presenceAware) {
      try {
        ownerAway = powerMonitor.getSystemIdleTime() >= OWNER_AWAY_SECONDS
      } catch {
        ownerAway = false
      }
    }
    saveState()
    if (process.platform === 'darwin') app.dock?.hide()

    ipcMain.handle('habitat:load-state', (event) => {
      if (event.sender !== window?.webContents) throw new Error('untrusted renderer')
      return { ...state, ownerPresent: !ownerAway }
    })
    ipcMain.on('habitat:save-state', (event, patch: Partial<HabitatState>) => {
      if (event.sender !== window?.webContents) return
      state = {
        ...state,
        quiet: typeof patch.quiet === 'boolean' ? patch.quiet : state.quiet,
        trust: finiteBetween(patch.trust, 0, 1, state.trust),
        encounters: finiteIntegerBetween(
          patch.encounters,
          0,
          Number.MAX_SAFE_INTEGER,
          state.encounters,
        ),
        bench: typeof patch.bench === 'boolean' ? patch.bench : state.bench,
        discoveries: finiteIntegerBetween(patch.discoveries, 0, 0b111, state.discoveries),
      }
      saveState()
    })
    ipcMain.on('habitat:set-quiet', (event, quiet: unknown) => {
      if (event.sender !== window?.webContents || typeof quiet !== 'boolean') return
      state.quiet = quiet
      saveState()
      rebuildTrayMenu()
    })
    ipcMain.on('habitat:reset-position', (event) => {
      if (event.sender === window?.webContents) window.setBounds(homeBounds(), true)
    })
    ipcMain.on('habitat:hide', (event) => {
      if (event.sender === window?.webContents) hideWindow()
    })
    ipcMain.on('habitat:set-motion', (event, direction: unknown) => {
      if (event.sender !== window?.webContents || (direction !== -1 && direction !== 0 && direction !== 1)) return
      motionDirection = direction
    })
    ipcMain.on('habitat:hit-test-result', (event, sequence: unknown, interactive: unknown) => {
      if (
        event.sender !== window?.webContents ||
        typeof sequence !== 'number' ||
        !Number.isSafeInteger(sequence) ||
        sequence <= lastHitTestResult ||
        typeof interactive !== 'boolean'
      ) return
      lastHitTestResult = sequence
      if (interactive) motionDirection = 0
      applyMousePassthrough(!interactive)
    })
    ipcMain.on('habitat:drag-begin', (event) => {
      if (event.sender !== window?.webContents || !window) return
      const bounds = window.getBounds()
      const point = screen.getCursorScreenPoint()
      dragOffset = { x: point.x - bounds.x, y: point.y - bounds.y }
      applyMousePassthrough(false)
    })
    ipcMain.on('habitat:drag-end', (event) => {
      if (event.sender === window?.webContents) dragOffset = null
    })

    createWindow()
    createTray()
    setInterval(pollMouseHitTest, HIT_TEST_INTERVAL_MS).unref()
    setInterval(walkDesktop, WALK_INTERVAL_MS).unref()
    setInterval(dragTick, DRAG_INTERVAL_MS).unref()
    setInterval(pollOwnerPresence, PRESENCE_INTERVAL_MS).unref()
    powerMonitor.on('lock-screen', () => setOwnerAway(true))
    powerMonitor.on('unlock-screen', () => setOwnerAway(false))
    powerMonitor.on('resume', () => pollOwnerPresence())
    app.on('activate', () => showWindow())
  })
}

app.on('before-quit', () => {
  quitting = true
})

app.on('window-all-closed', () => {
  if (quitting || !tray) app.quit()
})
