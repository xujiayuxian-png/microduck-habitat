import { spawnSync } from 'node:child_process'

const npmArguments = ['audit', '--audit-level=high', '--package-lock-only', '--json']
const npmCli = process.env.npm_execpath
const command = npmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm'
const args = npmCli ? [npmCli, ...npmArguments] : npmArguments

for (let attempt = 1; attempt <= 3; attempt += 1) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const report = parseReport(result.stdout)
  const vulnerabilities = report?.metadata?.vulnerabilities

  if (result.status === 0 && vulnerabilities) {
    console.log(
      `audited ${report.metadata.totalDependencies ?? 'locked'} packages; ` +
      `high=${vulnerabilities.high ?? 0}, critical=${vulnerabilities.critical ?? 0}`,
    )
    break
  }

  if (vulnerabilities && ((vulnerabilities.high ?? 0) > 0 || (vulnerabilities.critical ?? 0) > 0)) {
    process.stderr.write(result.stdout || result.stderr || 'npm audit found a high-severity vulnerability\n')
    process.exitCode = result.status || 1
    break
  }

  if (attempt === 3) {
    process.stderr.write(result.stderr || result.stdout || 'npm audit failed without a report\n')
    process.exitCode = result.status || 1
    break
  }

  console.warn(`npm audit did not return a report; retrying (${attempt}/3)`)
  await delay(attempt * 1_000)
}

function parseReport(output) {
  try {
    return JSON.parse(output)
  } catch {
    return null
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
