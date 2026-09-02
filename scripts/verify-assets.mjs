import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const expected = '1e1200053e2326706632306bc80831d5e0dfa5462d792a677fc05a43f145651e'
const local = resolve('assets/duck.bin')
const upstream = resolve('../robotctl/assets/duck.bin')

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

const localDigest = digest(local)
if (localDigest !== expected) {
  throw new Error(`assets/duck.bin digest is ${localDigest}; expected ${expected}`)
}

if (existsSync(upstream)) {
  const upstreamDigest = digest(upstream)
  if (upstreamDigest !== localDigest) {
    throw new Error(
      `vendored duck.bin is stale (${localDigest}); parent robotctl asset is ${upstreamDigest}`,
    )
  }
}

console.log(`verified assets/duck.bin ${localDigest}`)
