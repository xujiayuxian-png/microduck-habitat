import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const releaseDirectory = join(process.cwd(), 'release')
const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
const artifactPattern = /\.(?:AppImage|deb|exe|dmg|zip)$/i
await mkdir(releaseDirectory, { recursive: true })

const entries = await readdir(releaseDirectory, { withFileTypes: true })
const artifactNames = entries
  .filter((entry) => entry.isFile() && artifactPattern.test(entry.name))
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right, 'en'))
if (artifactNames.length === 0) throw new Error('release/ contains no distributable artifacts')

const sbomName = `microduck-habitat-${packageJson.version}.spdx.json`
const sbom = generateSbom()
const parsedSbom = JSON.parse(sbom)
if (parsedSbom.spdxVersion !== 'SPDX-2.3' || parsedSbom.name !== `${packageJson.name}@${packageJson.version}`) {
  throw new Error('npm generated an unexpected SPDX document')
}
await writeFile(join(releaseDirectory, sbomName), `${JSON.stringify(parsedSbom, null, 2)}\n`, 'utf8')

const artifacts = []
for (const file of artifactNames) {
  const path = join(releaseDirectory, file)
  const metadata = await stat(path)
  artifacts.push({ file, size: metadata.size, sha256: await sha256(path) })
}

const sbomPath = join(releaseDirectory, sbomName)
const manifestName = 'release-manifest.json'
const manifest = {
  schemaVersion: 1,
  product: packageJson.build?.productName ?? packageJson.name,
  version: packageJson.version,
  sourceRevision: process.env.GITHUB_SHA ?? null,
  sourceRef: process.env.GITHUB_REF_NAME ?? null,
  artifacts,
  sbom: {
    file: sbomName,
    format: 'SPDX-2.3',
    sha256: await sha256(sbomPath),
  },
}
await writeFile(join(releaseDirectory, manifestName), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

const checksumNames = [...artifactNames, manifestName, sbomName]
  .sort((left, right) => left.localeCompare(right, 'en'))
const checksumLines = []
for (const file of checksumNames) {
  checksumLines.push(`${await sha256(join(releaseDirectory, file))}  ${file}`)
}
await writeFile(join(releaseDirectory, 'SHA256SUMS'), `${checksumLines.join('\n')}\n`, 'utf8')

console.log(`created release evidence for ${artifactNames.length} artifact(s)`)

function generateSbom() {
  const npmArguments = ['sbom', '--package-lock-only', '--sbom-format', 'spdx', '--sbom-type', 'application']
  const npmCli = process.env.npm_execpath
  const command = npmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const args = npmCli ? [npmCli, ...npmArguments] : npmArguments
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  if (result.status !== 0 || !result.stdout) {
    throw new Error(`npm sbom failed with status ${result.status ?? 'unknown'}`)
  }
  return result.stdout
}

async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
