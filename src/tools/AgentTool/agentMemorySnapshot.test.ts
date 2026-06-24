import { describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { getSnapshotRootForProject } from './agentMemorySnapshot.js'

describe('agent memory snapshot root resolution', () => {
  test('defaults to canonical .ncode snapshot root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ncode-agent-snapshot-'))
    expect(getSnapshotRootForProject(root)).toBe(
      join(root, '.ncode', 'agent-memory-snapshots'),
    )
  })

  test('falls back to legacy .claude snapshot root when it already exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ncode-agent-snapshot-legacy-'))
    await mkdir(join(root, '.claude', 'agent-memory-snapshots'), {
      recursive: true,
    })

    expect(getSnapshotRootForProject(root)).toBe(
      join(root, '.claude', 'agent-memory-snapshots'),
    )
  })

  test('prefers canonical .ncode snapshot root when both exist', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ncode-agent-snapshot-both-'))
    await mkdir(join(root, '.claude', 'agent-memory-snapshots'), {
      recursive: true,
    })
    await mkdir(join(root, '.ncode', 'agent-memory-snapshots'), {
      recursive: true,
    })

    expect(getSnapshotRootForProject(root)).toBe(
      join(root, '.ncode', 'agent-memory-snapshots'),
    )
  })
})
