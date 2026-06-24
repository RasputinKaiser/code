import { describe, expect, it } from 'bun:test'
import type { Diff } from './frame.js'
import { optimize } from './optimizer.js'
import {
  getOptimizerStatsSnapshot,
  resetOptimizerStatsForTesting,
} from './optimizerStats.js'

describe('optimize', () => {
  it('merges adjacent stdout patches', () => {
    resetOptimizerStatsForTesting()
    const diff: Diff = [
      { type: 'stdout', content: 'abc' },
      { type: 'stdout', content: 'def' },
      { type: 'stdout', content: '' },
      { type: 'stdout', content: '\n' },
    ]

    expect(optimize(diff)).toEqual([
      { type: 'stdout', content: 'abcdef\n' },
    ])

    const snapshot = getOptimizerStatsSnapshot()
    expect(snapshot.optimizeCalls).toBe(1)
    expect(snapshot.lastInputPatchCount).toBe(4)
    expect(snapshot.lastOutputPatchCount).toBe(1)
    expect(snapshot.inputPatchTypeCounts.stdout).toBe(4)
    expect(snapshot.stdoutMergeCount).toBe(2)
    expect(snapshot.noopCursorMoveDropCount).toBe(0)
  })

  it('does not merge stdout across control patches', () => {
    resetOptimizerStatsForTesting()
    const diff: Diff = [
      { type: 'stdout', content: 'abc' },
      { type: 'styleStr', str: '\u001b[32m' },
      { type: 'stdout', content: 'def' },
      { type: 'cursorMove', x: 1, y: 0 },
      { type: 'stdout', content: 'ghi' },
      { type: 'stdout', content: 'jkl' },
    ]

    expect(optimize(diff)).toEqual([
      { type: 'stdout', content: 'abc' },
      { type: 'styleStr', str: '\u001b[32m' },
      { type: 'stdout', content: 'def' },
      { type: 'cursorMove', x: 1, y: 0 },
      { type: 'stdout', content: 'ghijkl' },
    ])

    const snapshot = getOptimizerStatsSnapshot()
    expect(snapshot.lastInputPatchCount).toBe(6)
    expect(snapshot.lastOutputPatchCount).toBe(5)
    expect(snapshot.stdoutMergeCount).toBe(1)
    expect(snapshot.noopCursorMoveDropCount).toBe(0)
    expect(snapshot.styleStrMergeCount).toBe(0)
  })

  it('counts dropped no-op cursor moves', () => {
    resetOptimizerStatsForTesting()
    const diff: Diff = [
      { type: 'cursorMove', x: 0, y: 0 },
      { type: 'stdout', content: 'a' },
      { type: 'cursorMove', x: 0, y: 0 },
    ]

    expect(optimize(diff)).toEqual([{ type: 'stdout', content: 'a' }])

    const snapshot = getOptimizerStatsSnapshot()
    expect(snapshot.lastInputPatchCount).toBe(3)
    expect(snapshot.lastOutputPatchCount).toBe(1)
    expect(snapshot.noopCursorMoveDropCount).toBe(2)
  })
})
