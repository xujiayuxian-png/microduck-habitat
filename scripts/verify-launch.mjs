import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const executable = packagedExecutable()
if (!existsSync(executable)) throw new Error(`packaged executable does not exist: ${executable}`)
const isAppImage = process.argv.includes('--appimage')

const profile = await mkdtemp(join(tmpdir(), 'microduck-packaged-'))
const statePath = join(profile, 'habitat.json')
const errors = []
const child = spawn(executable, [`--user-data-dir=${profile}`], {
  detached: process.platform !== 'win32',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    ELECTRON_NO_ATTACH_CONSOLE: '1',
    ...(isAppImage ? { APPIMAGE_EXTRACT_AND_RUN: '1' } : {}),
  },
  stdio: ['ignore', 'ignore', 'pipe'],
})
child.stderr.setEncoding('utf8')
child.stderr.on('data', (chunk) => errors.push(chunk))

try {
  await waitForReady(child, statePath)
  const state = JSON.parse(await readFile(statePath, 'utf8'))
  if (!Number.isInteger(state.seed) || state.seed === 0) {
    throw new Error('packaged app wrote an invalid habitat seed')
  }
  if (
    typeof state.bench !== 'boolean' ||
    !Number.isInteger(state.discoveries) ||
    state.presenceAware !== true
  ) {
    throw new Error('packaged app wrote an invalid calibration bench state')
  }
  console.log(`launched hardened ${process.platform}/${process.arch} package; state is ready`)
} finally {
  await terminate(child)
  child.stderr.destroy()
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}

function packagedExecutable() {
  if (process.argv.includes('--appimage')) {
    if (process.platform !== 'linux') throw new Error('--appimage is only available on Linux')
    return join('release', 'microduck-habitat-0.1.0-linux-x86_64.AppImage')
  }
  if (process.platform === 'win32') {
    return join('release', 'win-unpacked', 'Microduck Habitat.exe')
  }
  if (process.platform === 'darwin') {
    const directory = process.arch === 'arm64' ? 'mac-arm64' : 'mac'
    return join(
      'release',
      directory,
      'Microduck Habitat.app',
      'Contents',
      'MacOS',
      'Microduck Habitat',
    )
  }
  return join('release', 'linux-unpacked', 'microduck-habitat')
}

async function waitForReady(child, statePath) {
  const deadline = Date.now() + 12_000
  while (Date.now() < deadline) {
    if (existsSync(statePath)) return
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`packaged app exited before readiness (${child.exitCode ?? child.signalCode})\n${errors.join('')}`)
    }
    await delay(100)
  }
  throw new Error(`packaged app did not become ready\n${errors.join('')}`)
}

async function terminate(child) {
  if (!child.pid) throw new Error('packaged app has no process id')
  if (process.platform === 'win32') {
    await terminateWindowsTree(child)
    return
  }

  signalGroup(child.pid, 'SIGTERM')
  if (await groupExitsWithin(child.pid, 5_000)) return

  signalGroup(child.pid, 'SIGKILL')
  await groupExitsWithin(child.pid, 1_000)
  throw new Error(`packaged app did not terminate after readiness\n${errors.join('')}`)
}

async function terminateWindowsTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let killerError = ''
  killer.stderr.setEncoding('utf8')
  killer.stderr.on('data', (chunk) => { killerError += chunk })
  const code = await new Promise((resolve) => killer.once('exit', resolve))
  if (code !== 0 || !(await exitsWithin(child, 5_000))) {
    throw new Error(`could not terminate packaged app tree\n${killerError}${errors.join('')}`)
  }
}

function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal)
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
}

async function groupExitsWithin(pid, milliseconds) {
  const deadline = Date.now() + milliseconds
  while (Date.now() < deadline) {
    if (!groupExists(pid)) return true
    await delay(50)
  }
  return !groupExists(pid)
}

function groupExists(pid) {
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    if (error?.code === 'ESRCH') return false
    throw error
  }
}

function onceExited(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => child.once('exit', resolve))
}

function exitsWithin(child, milliseconds) {
  let timeout
  const result = Promise.race([
    onceExited(child).then(() => true),
    new Promise((resolve) => {
      timeout = setTimeout(() => resolve(false), milliseconds)
      timeout.unref()
    }),
  ])
  return result.finally(() => clearTimeout(timeout))
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
