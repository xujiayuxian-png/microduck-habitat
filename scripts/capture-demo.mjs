import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright-core'

const output = join(process.cwd(), 'docs', 'media')
const profileRoot = await mkdtemp(join(tmpdir(), 'microduck-demo-'))
const profile = join(profileRoot, 'profile')
const executablePath = createRequire(import.meta.url)('electron')
await mkdir(output, { recursive: true })
await mkdir(profile, { recursive: true })
await writeFile(
  join(profile, 'habitat.json'),
  `${JSON.stringify({ seed: 1, quiet: true, trust: 0.58, encounters: 5, bench: false }, null, 2)}\n`,
)

const environment = { ...process.env, XDG_CONFIG_HOME: profileRoot }
delete environment.ELECTRON_RUN_AS_NODE
delete environment.ELECTRON_NO_ATTACH_CONSOLE

const application = await electron.launch({
  executablePath,
  args: ['.', `--user-data-dir=${profile}`],
  env: environment,
})

try {
  const page = await application.firstWindow()
  await page.waitForSelector('#world')
  await page.waitForTimeout(1_000)

  const mimeType = await page.evaluate(() => {
    const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? ''
  })
  if (!mimeType) throw new Error('this Electron build cannot record WebM video')

  await page.evaluate((type) => {
    const source = document.querySelector('#world')
    if (!(source instanceof HTMLCanvasElement)) throw new Error('world canvas is unavailable')

    const recording = document.createElement('canvas')
    recording.width = 480
    recording.height = 560
    const context = recording.getContext('2d', { alpha: false })
    if (!context) throw new Error('recording canvas is unavailable')

    let drawing = true
    const draw = () => {
      const base = context.createLinearGradient(0, 0, recording.width, recording.height)
      base.addColorStop(0, '#202522')
      base.addColorStop(1, '#111513')
      context.fillStyle = base
      context.fillRect(0, 0, recording.width, recording.height)

      const purple = context.createRadialGradient(360, 125, 0, 360, 125, 260)
      purple.addColorStop(0, 'rgb(111 82 150 / 0.34)')
      purple.addColorStop(1, 'rgb(111 82 150 / 0)')
      context.fillStyle = purple
      context.fillRect(0, 0, recording.width, recording.height)

      const green = context.createRadialGradient(100, 430, 0, 100, 430, 270)
      green.addColorStop(0, 'rgb(62 145 139 / 0.25)')
      green.addColorStop(1, 'rgb(62 145 139 / 0)')
      context.fillStyle = green
      context.fillRect(0, 0, recording.width, recording.height)
      context.drawImage(source, 0, 0, recording.width, recording.height)
      if (drawing) requestAnimationFrame(draw)
    }
    draw()

    const chunks = []
    const recorder = new MediaRecorder(recording.captureStream(30), {
      mimeType: type,
      videoBitsPerSecond: 2_400_000,
    })
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.start(250)
    window.__microduckDemo = { chunks, recorder, stopDrawing: () => { drawing = false } }
  }, mimeType)

  await page.mouse.move(70, 100)
  await page.waitForTimeout(1_200)
  await page.mouse.move(150, 92, { steps: 12 })
  await page.waitForTimeout(900)
  await page.mouse.click(135, 92)
  await page.waitForTimeout(2_400)
  await page.evaluate(() => {
    document.querySelector('#bench')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForTimeout(4_500)

  const dataUrl = await page.evaluate(() => new Promise((resolve, reject) => {
    const demo = window.__microduckDemo
    if (!demo) return reject(new Error('demo recorder is unavailable'))
    demo.recorder.onerror = () => reject(new Error('demo recording failed'))
    demo.recorder.onstop = () => {
      demo.stopDrawing()
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(new Blob(demo.chunks, { type: demo.recorder.mimeType }))
    }
    demo.recorder.stop()
  }))

  const encoded = String(dataUrl).split(',')[1]
  if (!encoded) throw new Error('demo recording produced no data')
  await writeFile(join(output, 'microduck-demo.webm'), Buffer.from(encoded, 'base64'))
  console.log(`captured ${mimeType} demo in ${output}`)
} finally {
  await application.close()
  await rm(profileRoot, { recursive: true, force: true })
}
