import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { FuseV1Options, getCurrentFuseWire } from '@electron/fuses'

const packages = [
  {
    name: 'Linux x64',
    executable: join('release', 'linux-unpacked', 'microduck-habitat'),
    resources: join('release', 'linux-unpacked', 'resources'),
  },
  {
    name: 'Windows x64',
    executable: join('release', 'win-unpacked', 'Microduck Habitat.exe'),
    resources: join('release', 'win-unpacked', 'resources'),
  },
  {
    name: 'macOS x64',
    executable: join(
      'release',
      'mac',
      'Microduck Habitat.app',
      'Contents',
      'MacOS',
      'Microduck Habitat',
    ),
    resources: join('release', 'mac', 'Microduck Habitat.app', 'Contents', 'Resources'),
  },
  {
    name: 'macOS arm64',
    executable: join(
      'release',
      'mac-arm64',
      'Microduck Habitat.app',
      'Contents',
      'MacOS',
      'Microduck Habitat',
    ),
    resources: join('release', 'mac-arm64', 'Microduck Habitat.app', 'Contents', 'Resources'),
  },
]

const expected = new Map([
  [FuseV1Options.RunAsNode, false],
  [FuseV1Options.EnableCookieEncryption, true],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, false],
  [FuseV1Options.EnableNodeCliInspectArguments, false],
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, true],
  [FuseV1Options.OnlyLoadAppFromAsar, true],
  [FuseV1Options.GrantFileProtocolExtraPrivileges, true],
])

let found = 0
for (const candidate of packages) {
  if (!existsSync(candidate.executable)) continue
  found += 1
  const wire = await getCurrentFuseWire(candidate.executable)
  for (const [fuse, enabled] of expected) {
    const actual = wire[fuse] === '1'.charCodeAt(0)
    if (actual !== enabled) {
      throw new Error(`${candidate.name} fuse ${FuseV1Options[fuse]} is ${actual}; expected ${enabled}`)
    }
  }
  for (const resource of [
    'app.asar',
    'icon.png',
    'LICENSE.txt',
    'THIRD_PARTY.md',
    join('licenses', 'three-MIT.txt'),
    join('licenses', 'lucide-ISC.txt'),
  ]) {
    if (!existsSync(join(candidate.resources, resource))) {
      throw new Error(`${candidate.name} is missing ${resource}`)
    }
  }
  console.log(`verified ${candidate.name} fuses and packaged notices`)
}

if (found === 0) throw new Error('no unpacked application was found under release/')
