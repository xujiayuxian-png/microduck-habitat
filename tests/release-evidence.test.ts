import { appendFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('release evidence', () => {
  it('works from the lockfile alone and detects a modified artifact', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'microduck-evidence-'))
    try {
      await mkdir(join(workspace, 'scripts'))
      await mkdir(join(workspace, 'release'))
      await cp('package.json', join(workspace, 'package.json'))
      await cp('package-lock.json', join(workspace, 'package-lock.json'))
      await cp(
        'scripts/create-release-evidence.mjs',
        join(workspace, 'scripts/create-release-evidence.mjs'),
      )
      await cp(
        'scripts/verify-release-evidence.mjs',
        join(workspace, 'scripts/verify-release-evidence.mjs'),
      )
      await writeFile(join(workspace, 'release', 'habitat-test.zip'), 'first artifact\n')
      await writeFile(join(workspace, 'release', 'habitat-test.deb'), 'second artifact\n')

      const generated = run(workspace, 'scripts/create-release-evidence.mjs')
      expect(generated.status, generated.stderr).toBe(0)
      const verified = run(workspace, 'scripts/verify-release-evidence.mjs')
      expect(verified.status, verified.stderr).toBe(0)

      const manifest = JSON.parse(
        await readFile(join(workspace, 'release', 'release-manifest.json'), 'utf8'),
      )
      expect(manifest.artifacts).toHaveLength(2)
      expect(manifest.sbom.format).toBe('SPDX-2.3')

      await appendFile(join(workspace, 'release', 'habitat-test.zip'), 'tampered\n')
      const tampered = run(workspace, 'scripts/verify-release-evidence.mjs')
      expect(tampered.status).not.toBe(0)
      expect(tampered.stderr).toContain('manifest does not match habitat-test.zip')
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })
})

function run(workspace: string, script: string) {
  return spawnSync(process.execPath, [script], {
    cwd: workspace,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
}
