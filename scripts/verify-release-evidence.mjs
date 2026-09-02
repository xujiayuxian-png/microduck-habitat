import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'

const releaseDirectory = join(process.cwd(), 'release')
const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
const manifest = JSON.parse(await readFile(join(releaseDirectory, 'release-manifest.json'), 'utf8'))
if (
  manifest.schemaVersion !== 1 ||
  manifest.version !== packageJson.version ||
  manifest.product !== (packageJson.build?.productName ?? packageJson.name) ||
  !Array.isArray(manifest.artifacts) ||
  manifest.artifacts.length === 0
) {
  throw new Error('release-manifest.json has an invalid header or no artifacts')
}

const expected = new Set(['release-manifest.json', manifest.sbom?.file])
for (const artifact of manifest.artifacts) {
  assertBasename(artifact.file)
  expected.add(artifact.file)
  const path = join(releaseDirectory, artifact.file)
  const metadata = await stat(path)
  if (metadata.size !== artifact.size || (await sha256(path)) !== artifact.sha256) {
    throw new Error(`manifest does not match ${artifact.file}`)
  }
}

assertBasename(manifest.sbom?.file)
const sbomPath = join(releaseDirectory, manifest.sbom.file)
const sbom = JSON.parse(await readFile(sbomPath, 'utf8'))
if (
  manifest.sbom.format !== 'SPDX-2.3' ||
  sbom.spdxVersion !== 'SPDX-2.3' ||
  sbom.name !== `${packageJson.name}@${packageJson.version}` ||
  (await sha256(sbomPath)) !== manifest.sbom.sha256
) {
  throw new Error('SPDX SBOM does not match the release manifest')
}

const sums = await readFile(join(releaseDirectory, 'SHA256SUMS'), 'utf8')
const seen = new Set()
for (const line of sums.trimEnd().split('\n')) {
  const match = /^([0-9a-f]{64})  ([^/\\]+)$/.exec(line)
  if (!match) throw new Error(`invalid SHA256SUMS line: ${line}`)
  const [, digest, file] = match
  if (!digest || !file || seen.has(file)) throw new Error(`duplicate or incomplete checksum for ${file}`)
  seen.add(file)
  if ((await sha256(join(releaseDirectory, file))) !== digest) {
    throw new Error(`SHA256SUMS does not match ${file}`)
  }
}

if (seen.size !== expected.size || [...expected].some((file) => !seen.has(file))) {
  throw new Error('SHA256SUMS and release-manifest.json describe different files')
}

console.log(`verified release evidence for ${manifest.artifacts.length} artifact(s)`)

function assertBasename(file) {
  if (typeof file !== 'string' || file.length === 0 || basename(file) !== file) {
    throw new Error(`unsafe release filename: ${String(file)}`)
  }
}

async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
