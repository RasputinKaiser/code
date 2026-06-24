import { beforeEach, describe, expect, it } from 'bun:test'
import { RawAnsi, resetRawAnsiJoinCachesForTesting } from './RawAnsi.js'
import {
  getRawAnsiRenderStatsSnapshot,
  resetRawAnsiRenderStatsForTesting,
} from './rawAnsiRenderStats.js'

beforeEach(() => {
  resetRawAnsiJoinCachesForTesting()
  resetRawAnsiRenderStatsForTesting()
})

describe('RawAnsi telemetry', () => {
  it('tracks empty renders without join work', () => {
    const element = RawAnsi({ lines: [], width: 80 })
    const snapshot = getRawAnsiRenderStatsSnapshot()

    expect(element).toBeNull()
    expect(snapshot.renderCalls).toBe(1)
    expect(snapshot.emptyRenderCalls).toBe(1)
    expect(snapshot.joinCalls).toBe(0)
  })

  it('forwards pre-split lines directly to ink-raw-ansi', () => {
    const lines = ['\u001b[32mhello\u001b[39m', 'world']

    const first = RawAnsi({ lines, width: 120 }) as any
    const second = RawAnsi({ lines, width: 64 }) as any
    const snapshot = getRawAnsiRenderStatsSnapshot()

    expect(first?.props?.rawLines).toBe(lines)
    expect(second?.props?.rawLines).toBe(lines)
    expect(snapshot.renderCalls).toBe(2)
    expect(snapshot.emptyRenderCalls).toBe(0)
    expect(snapshot.joinCalls).toBe(0)
    expect(snapshot.joinCacheMisses).toBe(0)
    expect(snapshot.joinCacheHits).toBe(0)
    expect(snapshot.lastLineCount).toBe(0)
    expect(snapshot.lastJoinedBytes).toBe(0)
    expect(snapshot.maxJoinedBytes).toBe(0)
    expect(snapshot.totalJoinedBytes).toBe(0)
  })
})
