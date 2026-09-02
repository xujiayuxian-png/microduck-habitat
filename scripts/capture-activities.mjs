import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright-core'

const activities = ['settle', 'observe', 'stroll', 'preen', 'doze', 'delight', 'startle']
const artifacts = join(process.cwd(), 'artifacts', 'activities')
const executablePath = createRequire(import.meta.url)('electron')
const hashes = new Set()
await mkdir(artifacts, { recursive: true })

for (const activity of activities) {
  const profileRoot = await mkdtemp(join(tmpdir(), `microduck-${activity}-`))
  const profile = join(profileRoot, 'profile')
  await mkdir(profile, { recursive: true })
  await writeFile(
    join(profile, 'habitat.json'),
    JSON.stringify({ seed: 1, quiet: true, trust: 0.42, encounters: 3 }),
  )

  const environment = {
    ...process.env,
    XDG_CONFIG_HOME: profileRoot,
    HABITAT_CAPTURE_ACTIVITY: activity,
  }
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
    const screenshot = await page.screenshot({
      path: join(artifacts, `${activity}.png`),
      omitBackground: true,
    })
    hashes.add(createHash('sha256').update(screenshot).digest('hex'))
  } finally {
    await application.close()
    await rm(profileRoot, { recursive: true, force: true })
  }
}

if (hashes.size !== activities.length) {
  throw new Error(`expected ${activities.length} distinct activity renders, got ${hashes.size}`)
}

console.log(`captured ${activities.length} distinct activities in ${artifacts}`)
