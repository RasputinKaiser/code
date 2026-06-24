import { afterEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, relative } from 'path'
import { getEmptyToolPermissionContext } from '../Tool.js'
import { buildFileGlobRipgrepArgs, glob } from './glob.js'

const tempRoots: string[] = []

afterEach(() => {
  delete process.env.CLAUDE_CODE_GLOB_NO_IGNORE
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ncode-glob-defaults-test-'))
  tempRoots.push(root)
  return root
}

function relativePosix(root: string, filePath: string): string {
  return relative(root, filePath).replaceAll('\\', '/')
}

describe('glob defaults', () => {
  it('does not ask ripgrep to mtime-sort the entire unfiltered search root', () => {
    const args = buildFileGlobRipgrepArgs({
      ignorePatterns: ['node_modules/**'],
      pluginExclusions: ['!.plugins/orphaned/**'],
      noIgnore: false,
      hidden: true,
    })

    expect(args).toContain('--files')
    expect(args).not.toContain('--sort=modified')
    expect(args).not.toContain('--no-ignore')
    expect(args).toEqual(
      expect.arrayContaining([
        '--glob',
        '!node_modules/**',
        '--glob',
        '!.plugins/orphaned/**',
      ]),
    )
  })

  it('respects .gitignore by default instead of passing --no-ignore', async () => {
    delete process.env.CLAUDE_CODE_GLOB_NO_IGNORE
    const root = makeTempRoot()
    mkdirSync(join(root, '.git'), { recursive: true })
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, '.gitignore'), 'ignored.txt\n')
    writeFileSync(join(root, 'kept.txt'), 'visible\n')
    writeFileSync(join(root, 'ignored.txt'), 'ignored\n')

    const { files, truncated } = await glob(
      '*.txt',
      root,
      { limit: 100, offset: 0 },
      new AbortController().signal,
      getEmptyToolPermissionContext(),
    )

    expect(truncated).toBe(false)
    expect(files.map(file => relativePosix(root, file)).sort()).toEqual([
      'kept.txt',
    ])
  })

  it('can still opt into no-ignore behavior explicitly', async () => {
    process.env.CLAUDE_CODE_GLOB_NO_IGNORE = 'true'
    const root = makeTempRoot()
    mkdirSync(join(root, '.git'), { recursive: true })
    writeFileSync(join(root, '.gitignore'), 'ignored.txt\n')
    writeFileSync(join(root, 'kept.txt'), 'visible\n')
    writeFileSync(join(root, 'ignored.txt'), 'ignored\n')

    const { files } = await glob(
      '*.txt',
      root,
      { limit: 100, offset: 0 },
      new AbortController().signal,
      getEmptyToolPermissionContext(),
    )

    expect(files.map(file => relativePosix(root, file)).sort()).toEqual([
      'ignored.txt',
      'kept.txt',
    ])
  })
})
