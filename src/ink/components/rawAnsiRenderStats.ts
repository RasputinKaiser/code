type RawAnsiRenderStats = {
  renderCalls: number
  emptyRenderCalls: number
  joinCalls: number
  joinCacheHits: number
  joinCacheMisses: number
  joinTotalMs: number
  joinMaxMs: number
  totalJoinedBytes: number
  maxJoinedBytes: number
  lastJoinedBytes: number
  lastLineCount: number
}

const stats: RawAnsiRenderStats = {
  renderCalls: 0,
  emptyRenderCalls: 0,
  joinCalls: 0,
  joinCacheHits: 0,
  joinCacheMisses: 0,
  joinTotalMs: 0,
  joinMaxMs: 0,
  totalJoinedBytes: 0,
  maxJoinedBytes: 0,
  lastJoinedBytes: 0,
  lastLineCount: 0,
}

export function recordRawAnsiRender(isEmpty: boolean): void {
  stats.renderCalls += 1
  if (isEmpty) {
    stats.emptyRenderCalls += 1
  }
}

export function recordRawAnsiJoin(sample: {
  cacheHit: boolean
  durationMs: number
  joinedBytes: number
  lineCount: number
}): void {
  stats.joinCalls += 1
  if (sample.cacheHit) {
    stats.joinCacheHits += 1
  } else {
    stats.joinCacheMisses += 1
  }
  stats.joinTotalMs += sample.durationMs
  stats.joinMaxMs = Math.max(stats.joinMaxMs, sample.durationMs)
  stats.totalJoinedBytes += sample.joinedBytes
  stats.maxJoinedBytes = Math.max(stats.maxJoinedBytes, sample.joinedBytes)
  stats.lastJoinedBytes = sample.joinedBytes
  stats.lastLineCount = sample.lineCount
}

export function getRawAnsiRenderStatsSnapshot(): RawAnsiRenderStats {
  return {
    ...stats,
  }
}

export function resetRawAnsiRenderStatsForTesting(): void {
  stats.renderCalls = 0
  stats.emptyRenderCalls = 0
  stats.joinCalls = 0
  stats.joinCacheHits = 0
  stats.joinCacheMisses = 0
  stats.joinTotalMs = 0
  stats.joinMaxMs = 0
  stats.totalJoinedBytes = 0
  stats.maxJoinedBytes = 0
  stats.lastJoinedBytes = 0
  stats.lastLineCount = 0
}

