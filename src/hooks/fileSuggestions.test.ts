import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { runWithCwdOverride } from '../utils/cwd.js'
import { execFileNoThrowWithCwd } from '../utils/execFileNoThrow.js'
import { getProjectFilesForSuggestionsForTesting } from './fileSuggestions.js'

const fixtureRoots: string[] = []

afterEach(async () => {
  while (fixtureRoots.length > 0) {
    await rm(fixtureRoots.pop()!, { recursive: true, force: true })
  }
})

describe('file suggestions project file discovery', () => {
  test('ripgrep fallback does not follow symlinks back to an ancestor', async () => {
    const root = path.join(
      tmpdir(),
      `ncode-file-suggestions-loop-${process.pid}-${Date.now()}`,
    )
    fixtureRoots.push(root)
    await mkdir(path.join(root, 'nested'), { recursive: true })
    await writeFile(path.join(root, 'root-file.txt'), 'root\n', 'utf8')
    await writeFile(path.join(root, 'nested', 'leaf.txt'), 'leaf\n', 'utf8')
    await symlink(root, path.join(root, 'nested', 'back-to-root'), 'dir')

    const files = await runWithCwdOverride(root, () =>
      getProjectFilesForSuggestionsForTesting(AbortSignal.timeout(5_000), true),
    )

    expect(files).toContain('root-file.txt')
    expect(files).toContain(path.join('nested', 'leaf.txt'))
    expect(files.some(file => file.includes('back-to-root'))).toBe(false)
  })

  test('uses Sapling tracked files before ripgrep in sl workspaces', async () => {
    if (!Bun.which('sl')) {
      return
    }

    const root = path.join(
      tmpdir(),
      `ncode-file-suggestions-sl-${process.pid}-${Date.now()}`,
    )
    fixtureRoots.push(root)
    await mkdir(path.join(root, 'nested'), { recursive: true })
    await execFileNoThrowWithCwd('sl', ['init', root], { timeout: 5000 })
    await writeFile(path.join(root, 'tracked.txt'), 'tracked\n', 'utf8')
    await writeFile(path.join(root, 'nested', 'tracked-child.txt'), 'child\n', 'utf8')
    await writeFile(path.join(root, 'untracked.txt'), 'untracked\n', 'utf8')
    await symlink(root, path.join(root, 'nested', 'back-to-root'), 'dir')
    await execFileNoThrowWithCwd(
      'sl',
      ['add', 'tracked.txt', path.join('nested', 'tracked-child.txt')],
      { cwd: root, timeout: 5000 },
    )

    const files = await runWithCwdOverride(root, () =>
      getProjectFilesForSuggestionsForTesting(AbortSignal.timeout(5_000), true),
    )

    expect(files).toContain('tracked.txt')
    expect(files).toContain(path.join('nested', 'tracked-child.txt'))
    expect(files).not.toContain('untracked.txt')
    expect(files.some(file => file.includes('back-to-root'))).toBe(false)
  })
})
