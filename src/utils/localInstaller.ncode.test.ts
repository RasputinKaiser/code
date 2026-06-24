import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const tempDirs: string[] = []

afterEach(() => {
  delete process.env.NCODE_CONFIG_DIR
  delete process.env.CLAUDE_CONFIG_DIR
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`))
  tempDirs.push(dir)
  return dir
}

describe('local installer path migration', () => {
  test('defaults to canonical .ncode/local when no legacy install exists', async () => {
    const ncodeDir = makeTempDir('ncode-home')
    const claudeDir = makeTempDir('claude-home')
    process.env.NCODE_CONFIG_DIR = ncodeDir
    process.env.CLAUDE_CONFIG_DIR = claudeDir

    const { getLocalInstallDir } = await import('./localInstaller.js')
    expect(getLocalInstallDir()).toBe(join(ncodeDir, 'local'))
  })

  test('preserves legacy .claude/local when it already exists', async () => {
    const ncodeDir = makeTempDir('ncode-home')
    const claudeDir = makeTempDir('claude-home')
    mkdirSync(join(claudeDir, 'local'), { recursive: true })
    process.env.NCODE_CONFIG_DIR = ncodeDir
    process.env.CLAUDE_CONFIG_DIR = claudeDir

    const { getLocalInstallDir } = await import('./localInstaller.js')
    expect(getLocalInstallDir()).toBe(join(claudeDir, 'local'))
  })
})
