import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, stat, utimes } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  BRIDGE_POINTER_TTL_MS,
  clearBridgePointer,
  getBridgePointerPath,
  readBridgePointer,
  writeBridgePointer,
} from './bridgePointer.js'

let configDir: string
let worktreeDir: string
const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR

beforeEach(async () => {
  configDir = await mkdtemp(join(tmpdir(), 'bridge-pointer-config-'))
  worktreeDir = await mkdtemp(join(tmpdir(), 'bridge-pointer-worktree-'))
  process.env.CLAUDE_CONFIG_DIR = configDir
})

afterEach(async () => {
  if (originalClaudeConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir
  }
  await clearBridgePointer(worktreeDir)
})

describe('bridgePointer', () => {
  it('writes and reads a fresh bridge pointer from crash-recovery storage', async () => {
    await writeBridgePointer(worktreeDir, {
      sessionId: 'session_12345678-1234-1234-1234-1234567890ab',
      environmentId: 'env-1',
      source: 'repl',
    })

    const pointer = await readBridgePointer(worktreeDir)

    expect(pointer).toMatchObject({
      sessionId: 'session_12345678-1234-1234-1234-1234567890ab',
      environmentId: 'env-1',
      source: 'repl',
    })
    expect(pointer?.ageMs).toBeGreaterThanOrEqual(0)
    expect(pointer?.ageMs).toBeLessThan(BRIDGE_POINTER_TTL_MS)
  })

  it('returns null and clears invalid pointer files', async () => {
    const pointerPath = getBridgePointerPath(worktreeDir)
    await Bun.write(pointerPath, '{"sessionId":"not-enough-fields"}')

    expect(await readBridgePointer(worktreeDir)).toBeNull()
    await expect(stat(pointerPath)).rejects.toThrow()
  })

  it('returns null and clears stale pointers based on file mtime', async () => {
    await writeBridgePointer(worktreeDir, {
      sessionId: 'session_12345678-1234-1234-1234-1234567890ab',
      environmentId: 'env-2',
      source: 'standalone',
    })

    const pointerPath = getBridgePointerPath(worktreeDir)
    const staleTime = new Date(Date.now() - BRIDGE_POINTER_TTL_MS - 1000)
    await utimes(pointerPath, staleTime, staleTime)

    expect(await readBridgePointer(worktreeDir)).toBeNull()
    await expect(readFile(pointerPath, 'utf8')).rejects.toThrow()
  })
})
