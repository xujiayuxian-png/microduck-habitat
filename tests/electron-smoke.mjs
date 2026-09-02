import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright-core'

const artifacts = join(process.cwd(), 'artifacts')
await mkdir(artifacts, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'microduck-habitat-'))
const statePath = join(profile, 'habitat.json')
await writeFile(
  statePath,
  `${JSON.stringify({
    seed: 0x5eed1234,
    quiet: false,
    trust: 0.18,
    encounters: 0,
    bench: false,
    discoveries: 0,
    presenceAware: false,
  }, null, 2)}\n`,
  'utf8',
)
const environment = { ...process.env, XDG_CONFIG_HOME: profile }
delete environment.ELECTRON_RUN_AS_NODE
delete environment.ELECTRON_NO_ATTACH_CONSOLE

const errors = []
const require = createRequire(import.meta.url)
const application = await electron.launch({
  executablePath: require('electron'),
  args: ['.', `--user-data-dir=${profile}`],
  env: environment,
})

try {
  const page = await application.firstWindow()
  const browserWindow = await application.browserWindow(page)
  await browserWindow.evaluate((target) => {
    target.webContents.setBackgroundThrottling(false)
    target.show()
  })
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`))

  await page.waitForSelector('#world')
  await page.waitForTimeout(1_500)
  const windowBounds = await browserWindow.evaluate((target) => target.getBounds())
  if (windowBounds.width !== 240 || windowBounds.height !== 280) {
    throw new Error(`desktop pet window is not 240x280: ${windowBounds.width}x${windowBounds.height}`)
  }
  const dragRegion = await page.locator('#drag-handle').evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { width: rect.width, height: rect.height, visible: rect.width > 0 && rect.height > 0 }
  })
  // Dragging itself follows the real OS cursor (main-process polling), which
  // CDP-injected mouse events do not move — so only the handle's presence and
  // size are asserted here; functional drag is checked manually.
  if (!dragRegion.visible || dragRegion.width < 44 || dragRegion.height < 16) {
    throw new Error(`drag region is not usable: ${JSON.stringify(dragRegion)}`)
  }
  const canvasStats = () => page.locator('#world').evaluate((element) => {
    const canvas = element
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return { width: canvas.width, height: canvas.height, opaque: 0, varied: 0, checksum: 0 }
    const pixels = new Uint8Array(canvas.width * canvas.height * 4)
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    let opaque = 0
    let varied = 0
    let checksum = 0
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] ?? 0
      if (alpha > 12) opaque += 1
      const red = pixels[index] ?? 0
      const green = pixels[index + 1] ?? 0
      const blue = pixels[index + 2] ?? 0
      if (alpha > 12 && Math.max(red, green, blue) - Math.min(red, green, blue) > 8) varied += 1
      if (index % 64 === 0) checksum = (checksum + red * 3 + green * 5 + blue * 7 + alpha) >>> 0
    }
    return { width: canvas.width, height: canvas.height, opaque, varied, checksum }
  })
  const canvas = await canvasStats()

  await page.screenshot({ path: join(artifacts, 'habitat.png'), omitBackground: true })

  const context = await page.evaluate(() => window.habitat.loadState())
  if (context.ownerPresent !== true || context.presenceAware !== false) {
    throw new Error('main process did not provide sanitized owner presence context')
  }
  await page.evaluate(() => {
    window.habitat.onOwnerPresence((present) => {
      document.documentElement.dataset.testOwnerPresent = String(present)
    })
  })
  await browserWindow.evaluate((target) => {
    target.webContents.send('habitat:owner-presence', false)
  })
  try {
    await page.waitForFunction(
      () => document.documentElement.dataset.testOwnerPresent === 'false',
      undefined,
      { polling: 50, timeout: 5_000 },
    )
  } catch {
    throw new Error('owner-away presence event did not reach the renderer')
  }
  await browserWindow.evaluate((target) => {
    target.webContents.send('habitat:owner-presence', true)
  })
  try {
    await page.waitForFunction(
      () => {
        const greeting = document.querySelector('#presence')
        return (
          document.documentElement.dataset.testOwnerPresent === 'true' &&
          greeting?.textContent === '...' &&
          greeting.getAttribute('data-visible') === 'true'
        )
      },
      undefined,
      { polling: 50, timeout: 5_000 },
    )
  } catch {
    throw new Error('return presence event did not produce a greeting')
  }

  if (canvas.width < 200 || canvas.height < 240) {
    throw new Error(`canvas is unexpectedly small: ${canvas.width}x${canvas.height}`)
  }
  const pixels = canvas.width * canvas.height
  if (canvas.opaque < pixels * 0.08) {
    throw new Error(`3D scene is blank: only ${canvas.opaque} non-transparent pixels`)
  }
  if (canvas.varied < pixels * 0.02) {
    throw new Error(`3D scene has no material variation: ${canvas.varied} coloured pixels`)
  }

  await page.locator('#menu-toggle').click()
  await page.locator('#bench').click()
  await page.waitForTimeout(700)
  if ((await page.locator('#bench').getAttribute('data-active')) !== 'true') {
    throw new Error('calibration bench control did not update its state')
  }
  const benchCanvas = await canvasStats()
  if (
    benchCanvas.checksum === canvas.checksum ||
    benchCanvas.opaque < pixels * 0.08 ||
    benchCanvas.varied < pixels * 0.02
  ) {
    throw new Error('calibration bench did not materially change the rendered scene')
  }
  const discoveredState = await waitForDiscovery(statePath)
  if (
    discoveredState.bench !== true ||
    discoveredState.discoveries === 0 ||
    discoveredState.presenceAware !== false
  ) {
    throw new Error('calibration bench exploration did not persist its first discovery')
  }
  await page.mouse.move(-20, -20)
  await page.waitForTimeout(180)
  await page.screenshot({ path: join(artifacts, 'habitat-workbench.png'), omitBackground: true })
  await page.locator('#menu-toggle').click()
  await page.locator('#bench').click()
  await page.waitForTimeout(700)
  if ((await page.locator('#bench').getAttribute('data-active')) !== 'false') {
    throw new Error('calibration bench did not close cleanly')
  }


  await page.locator('#menu-toggle').click()
  await page.locator('#rest').hover()
  await page.waitForTimeout(100)
  await page.locator('#rest').click()
  await page.waitForTimeout(650)
  if ((await page.locator('#presence').textContent()) !== 'z z') {
    throw new Error('rest control did not put Microduck to sleep')
  }
  const restingCanvas = await canvasStats()
  if (restingCanvas.checksum === canvas.checksum) {
    throw new Error('rest request did not change the animated frame')
  }

  await page.locator('#menu-toggle').click()
  await page.locator('#quiet').click()
  if ((await page.locator('#quiet').getAttribute('data-active')) !== 'true') {
    throw new Error('quiet control did not update its state')
  }
  await page.locator('#menu-toggle').click()
  await page.locator('#quiet').click()

  const canvasBox = await page.locator('#world').boundingBox()
  if (!canvasBox) throw new Error('canvas has no interactive bounds')
  await page.mouse.click(
    canvasBox.x + canvasBox.width * (280 / 480),
    canvasBox.y + canvasBox.height * (115 / 560),
  )
  await page.waitForTimeout(80)
  if ((await page.locator('#presence').textContent()) !== '...') {
    throw new Error('head interaction did not produce a response')
  }
  await page.screenshot({ path: join(artifacts, 'habitat-speaking.png'), omitBackground: true })

  await page.locator('#menu-toggle').click()
  await page.locator('#close').click()
  await page.waitForTimeout(100)
  const hidden = await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().every((candidate) => !candidate.isVisible()),
  )
  if (!hidden) throw new Error('hide control left the habitat visible')
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.showInactive())

  if (errors.length > 0) throw new Error(errors.join('\n'))

  console.log(
    `rendered ${canvas.width}x${canvas.height}; ${canvas.opaque} visible pixels, ${canvas.varied} coloured`,
  )
  console.log(`screenshot ${join(artifacts, 'habitat.png')}`)
} finally {
  await application.close()
  await rm(profile, { recursive: true, force: true })
}

async function waitForDiscovery(statePath) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    try {
      const state = JSON.parse(await readFile(statePath, 'utf8'))
      if (Number.isInteger(state.discoveries) && state.discoveries > 0) return state
    } catch {
      // The main process writes the file atomically; retry until the first discovery arrives.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('calibration bench did not discover a station before the timeout')
}
