import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright-core'

const profileRoot = await mkdtemp(join(tmpdir(), 'microduck-icon-'))
const profile = join(profileRoot, 'profile')
const resources = join(process.cwd(), 'resources')
await mkdir(profile, { recursive: true })
await mkdir(resources, { recursive: true })
await writeFile(
  join(profile, 'habitat.json'),
  JSON.stringify({ seed: 1, quiet: true, trust: 0.18, encounters: 0 }),
)

const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
delete environment.ELECTRON_NO_ATTACH_CONSOLE

const application = await electron.launch({
  executablePath: createRequire(import.meta.url)('electron'),
  args: ['.', `--user-data-dir=${profile}`],
  env: environment,
})

try {
  const page = await application.firstWindow()
  await page.waitForSelector('#world')
  await page.waitForTimeout(1_000)
  const dataUrl = await page.locator('#world').evaluate((source) => {
    const output = document.createElement('canvas')
    output.width = 512
    output.height = 512
    const context = output.getContext('2d')
    if (!context) throw new Error('2D canvas is unavailable')
    context.drawImage(source, 140, 42, 250, 250, 0, 0, 512, 512)
    return output.toDataURL('image/png')
  })
  await writeFile(join(resources, 'icon.png'), Buffer.from(dataUrl.split(',')[1], 'base64'))
  console.log(`wrote ${join(resources, 'icon.png')}`)
} finally {
  await application.close()
  await rm(profileRoot, { recursive: true, force: true })
}
