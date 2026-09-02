import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright-core'

const output = join(process.cwd(), 'docs', 'images')
const executablePath = createRequire(import.meta.url)('electron')
const backdrop = `
  html, body, #habitat {
    background:
      radial-gradient(circle at 72% 22%, rgb(111 82 150 / 38%), transparent 34%),
      radial-gradient(circle at 22% 78%, rgb(62 145 139 / 28%), transparent 38%),
      linear-gradient(145deg, #202522 0%, #111513 100%) !important;
  }
`

await mkdir(output, { recursive: true })

await capturePair()
await captureActivity('delight')

console.log(`captured README images in ${output}`)

async function capturePair() {
  const fixture = await launch({ bench: false })
  try {
    const { page } = fixture
    const hiddenChrome = await page.addStyleTag({
      content: '#controls, #drag-handle, #presence { display: none !important; }',
    })
    await page.waitForTimeout(1_000)
    await page.screenshot({ path: join(output, 'mascot.png'), omitBackground: true })
    await hiddenChrome.evaluate((element) => element.remove())

    await page.addStyleTag({ content: backdrop })
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(output, 'habitat.png') })

    await page.locator('#menu-toggle').click()
    await page.locator('#bench').click()
    await page.waitForTimeout(1_200)
    await page.mouse.move(-20, -20)
    await page.screenshot({ path: join(output, 'workbench.png') })
  } finally {
    await fixture.close()
  }
}

async function captureActivity(activity) {
  const fixture = await launch({ bench: false }, { HABITAT_CAPTURE_ACTIVITY: activity })
  try {
    await fixture.page.addStyleTag({ content: backdrop })
    await fixture.page.waitForTimeout(1_000)
    await fixture.page.screenshot({ path: join(output, `${activity}.png`) })
  } finally {
    await fixture.close()
  }
}

async function launch(state, extraEnvironment = {}) {
  const profileRoot = await mkdtemp(join(tmpdir(), 'microduck-readme-'))
  const profile = join(profileRoot, 'profile')
  await mkdir(profile, { recursive: true })
  await writeFile(
    join(profile, 'habitat.json'),
    `${JSON.stringify({ seed: 1, quiet: true, trust: 0.42, encounters: 3, ...state }, null, 2)}\n`,
  )

  const environment = { ...process.env, ...extraEnvironment, XDG_CONFIG_HOME: profileRoot }
  delete environment.ELECTRON_RUN_AS_NODE
  delete environment.ELECTRON_NO_ATTACH_CONSOLE

  const application = await electron.launch({
    executablePath,
    args: ['.', `--user-data-dir=${profile}`],
    env: environment,
  })
  const page = await application.firstWindow()
  await page.waitForSelector('#world')

  return {
    application,
    page,
    async close() {
      await application.close()
      await rm(profileRoot, { recursive: true, force: true })
    },
  }
}
