import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getWorktreesDir } from './worktree.js'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function makeRepoRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ncode-worktrees-'))
  tempDirs.push(dir)
  return dir
}

describe('getWorktreesDir', () => {
  test('defaults to canonical .ncode/worktrees for new repos', () => {
    const repoRoot = makeRepoRoot()
    expect(getWorktreesDir(repoRoot)).toBe(join(repoRoot, '.ncode', 'worktrees'))
  })

  test('uses canonical .ncode/worktrees when it already exists', () => {
    const repoRoot = makeRepoRoot()
    mkdirSync(join(repoRoot, '.ncode', 'worktrees'), { recursive: true })
    expect(getWorktreesDir(repoRoot)).toBe(join(repoRoot, '.ncode', 'worktrees'))
  })

  test('preserves legacy .claude/worktrees when it already exists', () => {
    const repoRoot = makeRepoRoot()
    mkdirSync(join(repoRoot, '.claude', 'worktrees'), { recursive: true })
    expect(getWorktreesDir(repoRoot)).toBe(join(repoRoot, '.claude', 'worktrees'))
  })

  test('prefers legacy .claude/worktrees when both roots exist', () => {
    const repoRoot = makeRepoRoot()
    mkdirSync(join(repoRoot, '.ncode', 'worktrees'), { recursive: true })
    mkdirSync(join(repoRoot, '.claude', 'worktrees'), { recursive: true })
    expect(getWorktreesDir(repoRoot)).toBe(join(repoRoot, '.claude', 'worktrees'))
  })
})
