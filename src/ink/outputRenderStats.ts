export type OutputRenderStatsSnapshot = {
  getCalls: number
  totalGetDurationMs: number
  maxGetDurationMs: number
  lastGetDurationMs: number
  totalClearPassDurationMs: number
  maxClearPassDurationMs: number
  lastClearPassDurationMs: number
  totalBlitDurationMs: number
  maxBlitDurationMs: number
  lastBlitDurationMs: number
  totalWriteDispatchDurationMs: number
  maxWriteDispatchDurationMs: number
  lastWriteDispatchDurationMs: number
  totalNoSelectDurationMs: number
  maxNoSelectDurationMs: number
  lastNoSelectDurationMs: number
  totalWriteOps: number
  totalBlitCells: number
  totalWriteCells: number
  totalWriteTextSplitCalls: number
  totalWriteLinesPassthroughCalls: number
  totalLineSourceDurationMs: number
  maxLineSourceDurationMs: number
  lastLineSourceDurationMs: number
  totalClipRejectDurationMs: number
  maxClipRejectDurationMs: number
  lastClipRejectDurationMs: number
  totalHorizontalClipDurationMs: number
  maxHorizontalClipDurationMs: number
  lastHorizontalClipDurationMs: number
  totalVerticalClipDurationMs: number
  maxVerticalClipDurationMs: number
  lastVerticalClipDurationMs: number
  totalWriteLineCalls: number
  totalWriteLineChars: number
  totalClusteredChars: number
  lineCacheHits: number
  lineCacheMisses: number
  plainAsciiMaterializeCount: number
  tokenizedMaterializeCount: number
  totalMaterializeDurationMs: number
  maxMaterializeDurationMs: number
  lastMaterializeDurationMs: number
  totalWriteLineDurationMs: number
  maxWriteLineDurationMs: number
  lastWriteLineDurationMs: number
  totalWriteLoopDurationMs: number
  maxWriteLoopDurationMs: number
  lastWriteLoopDurationMs: number
}

const outputRenderStats: OutputRenderStatsSnapshot = {
  getCalls: 0,
  totalGetDurationMs: 0,
  maxGetDurationMs: 0,
  lastGetDurationMs: 0,
  totalClearPassDurationMs: 0,
  maxClearPassDurationMs: 0,
  lastClearPassDurationMs: 0,
  totalBlitDurationMs: 0,
  maxBlitDurationMs: 0,
  lastBlitDurationMs: 0,
  totalWriteDispatchDurationMs: 0,
  maxWriteDispatchDurationMs: 0,
  lastWriteDispatchDurationMs: 0,
  totalNoSelectDurationMs: 0,
  maxNoSelectDurationMs: 0,
  lastNoSelectDurationMs: 0,
  totalWriteOps: 0,
  totalBlitCells: 0,
  totalWriteCells: 0,
  totalWriteTextSplitCalls: 0,
  totalWriteLinesPassthroughCalls: 0,
  totalLineSourceDurationMs: 0,
  maxLineSourceDurationMs: 0,
  lastLineSourceDurationMs: 0,
  totalClipRejectDurationMs: 0,
  maxClipRejectDurationMs: 0,
  lastClipRejectDurationMs: 0,
  totalHorizontalClipDurationMs: 0,
  maxHorizontalClipDurationMs: 0,
  lastHorizontalClipDurationMs: 0,
  totalVerticalClipDurationMs: 0,
  maxVerticalClipDurationMs: 0,
  lastVerticalClipDurationMs: 0,
  totalWriteLineCalls: 0,
  totalWriteLineChars: 0,
  totalClusteredChars: 0,
  lineCacheHits: 0,
  lineCacheMisses: 0,
  plainAsciiMaterializeCount: 0,
  tokenizedMaterializeCount: 0,
  totalMaterializeDurationMs: 0,
  maxMaterializeDurationMs: 0,
  lastMaterializeDurationMs: 0,
  totalWriteLineDurationMs: 0,
  maxWriteLineDurationMs: 0,
  lastWriteLineDurationMs: 0,
  totalWriteLoopDurationMs: 0,
  maxWriteLoopDurationMs: 0,
  lastWriteLoopDurationMs: 0,
}

export function recordOutputGetStats(stats: {
  getDurationMs: number
  clearPassDurationMs: number
  blitDurationMs: number
  writeDispatchDurationMs: number
  noSelectDurationMs: number
  writeOps: number
  blitCells: number
  writeCells: number
  writeTextSplitCalls: number
  writeLinesPassthroughCalls: number
  lineSourceDurationMs: number
  clipRejectDurationMs: number
  horizontalClipDurationMs: number
  verticalClipDurationMs: number
}): void {
  outputRenderStats.getCalls += 1
  outputRenderStats.totalGetDurationMs += stats.getDurationMs
  outputRenderStats.maxGetDurationMs = Math.max(
    outputRenderStats.maxGetDurationMs,
    stats.getDurationMs,
  )
  outputRenderStats.lastGetDurationMs = stats.getDurationMs
  outputRenderStats.totalClearPassDurationMs += stats.clearPassDurationMs
  outputRenderStats.maxClearPassDurationMs = Math.max(
    outputRenderStats.maxClearPassDurationMs,
    stats.clearPassDurationMs,
  )
  outputRenderStats.lastClearPassDurationMs = stats.clearPassDurationMs
  outputRenderStats.totalBlitDurationMs += stats.blitDurationMs
  outputRenderStats.maxBlitDurationMs = Math.max(
    outputRenderStats.maxBlitDurationMs,
    stats.blitDurationMs,
  )
  outputRenderStats.lastBlitDurationMs = stats.blitDurationMs
  outputRenderStats.totalWriteDispatchDurationMs += stats.writeDispatchDurationMs
  outputRenderStats.maxWriteDispatchDurationMs = Math.max(
    outputRenderStats.maxWriteDispatchDurationMs,
    stats.writeDispatchDurationMs,
  )
  outputRenderStats.lastWriteDispatchDurationMs = stats.writeDispatchDurationMs
  outputRenderStats.totalNoSelectDurationMs += stats.noSelectDurationMs
  outputRenderStats.maxNoSelectDurationMs = Math.max(
    outputRenderStats.maxNoSelectDurationMs,
    stats.noSelectDurationMs,
  )
  outputRenderStats.lastNoSelectDurationMs = stats.noSelectDurationMs
  outputRenderStats.totalWriteOps += stats.writeOps
  outputRenderStats.totalBlitCells += stats.blitCells
  outputRenderStats.totalWriteCells += stats.writeCells
  outputRenderStats.totalWriteTextSplitCalls += stats.writeTextSplitCalls
  outputRenderStats.totalWriteLinesPassthroughCalls += stats.writeLinesPassthroughCalls
  outputRenderStats.totalLineSourceDurationMs += stats.lineSourceDurationMs
  outputRenderStats.maxLineSourceDurationMs = Math.max(
    outputRenderStats.maxLineSourceDurationMs,
    stats.lineSourceDurationMs,
  )
  outputRenderStats.lastLineSourceDurationMs = stats.lineSourceDurationMs
  outputRenderStats.totalClipRejectDurationMs += stats.clipRejectDurationMs
  outputRenderStats.maxClipRejectDurationMs = Math.max(
    outputRenderStats.maxClipRejectDurationMs,
    stats.clipRejectDurationMs,
  )
  outputRenderStats.lastClipRejectDurationMs = stats.clipRejectDurationMs
  outputRenderStats.totalHorizontalClipDurationMs += stats.horizontalClipDurationMs
  outputRenderStats.maxHorizontalClipDurationMs = Math.max(
    outputRenderStats.maxHorizontalClipDurationMs,
    stats.horizontalClipDurationMs,
  )
  outputRenderStats.lastHorizontalClipDurationMs = stats.horizontalClipDurationMs
  outputRenderStats.totalVerticalClipDurationMs += stats.verticalClipDurationMs
  outputRenderStats.maxVerticalClipDurationMs = Math.max(
    outputRenderStats.maxVerticalClipDurationMs,
    stats.verticalClipDurationMs,
  )
  outputRenderStats.lastVerticalClipDurationMs = stats.verticalClipDurationMs
}

export function recordWriteLineToScreenStats(stats: {
  lineLength: number
  clusteredChars: number
  cacheHit: boolean
  usedPlainAsciiFastPath: boolean
  materializeDurationMs: number
  writeLineDurationMs: number
  writeLoopDurationMs: number
}): void {
  outputRenderStats.totalWriteLineCalls += 1
  outputRenderStats.totalWriteLineChars += stats.lineLength
  outputRenderStats.totalClusteredChars += stats.clusteredChars
  if (stats.cacheHit) {
    outputRenderStats.lineCacheHits += 1
  } else {
    outputRenderStats.lineCacheMisses += 1
    if (stats.usedPlainAsciiFastPath) {
      outputRenderStats.plainAsciiMaterializeCount += 1
    } else {
      outputRenderStats.tokenizedMaterializeCount += 1
    }
  }
  outputRenderStats.totalMaterializeDurationMs += stats.materializeDurationMs
  outputRenderStats.maxMaterializeDurationMs = Math.max(
    outputRenderStats.maxMaterializeDurationMs,
    stats.materializeDurationMs,
  )
  outputRenderStats.lastMaterializeDurationMs = stats.materializeDurationMs
  outputRenderStats.totalWriteLineDurationMs += stats.writeLineDurationMs
  outputRenderStats.maxWriteLineDurationMs = Math.max(
    outputRenderStats.maxWriteLineDurationMs,
    stats.writeLineDurationMs,
  )
  outputRenderStats.lastWriteLineDurationMs = stats.writeLineDurationMs
  outputRenderStats.totalWriteLoopDurationMs += stats.writeLoopDurationMs
  outputRenderStats.maxWriteLoopDurationMs = Math.max(
    outputRenderStats.maxWriteLoopDurationMs,
    stats.writeLoopDurationMs,
  )
  outputRenderStats.lastWriteLoopDurationMs = stats.writeLoopDurationMs
}

export function getOutputRenderStatsSnapshot(): OutputRenderStatsSnapshot {
  return { ...outputRenderStats }
}

export function resetOutputRenderStatsForTesting(): void {
  outputRenderStats.getCalls = 0
  outputRenderStats.totalGetDurationMs = 0
  outputRenderStats.maxGetDurationMs = 0
  outputRenderStats.lastGetDurationMs = 0
  outputRenderStats.totalClearPassDurationMs = 0
  outputRenderStats.maxClearPassDurationMs = 0
  outputRenderStats.lastClearPassDurationMs = 0
  outputRenderStats.totalBlitDurationMs = 0
  outputRenderStats.maxBlitDurationMs = 0
  outputRenderStats.lastBlitDurationMs = 0
  outputRenderStats.totalWriteDispatchDurationMs = 0
  outputRenderStats.maxWriteDispatchDurationMs = 0
  outputRenderStats.lastWriteDispatchDurationMs = 0
  outputRenderStats.totalNoSelectDurationMs = 0
  outputRenderStats.maxNoSelectDurationMs = 0
  outputRenderStats.lastNoSelectDurationMs = 0
  outputRenderStats.totalWriteOps = 0
  outputRenderStats.totalBlitCells = 0
  outputRenderStats.totalWriteCells = 0
  outputRenderStats.totalWriteTextSplitCalls = 0
  outputRenderStats.totalWriteLinesPassthroughCalls = 0
  outputRenderStats.totalLineSourceDurationMs = 0
  outputRenderStats.maxLineSourceDurationMs = 0
  outputRenderStats.lastLineSourceDurationMs = 0
  outputRenderStats.totalClipRejectDurationMs = 0
  outputRenderStats.maxClipRejectDurationMs = 0
  outputRenderStats.lastClipRejectDurationMs = 0
  outputRenderStats.totalHorizontalClipDurationMs = 0
  outputRenderStats.maxHorizontalClipDurationMs = 0
  outputRenderStats.lastHorizontalClipDurationMs = 0
  outputRenderStats.totalVerticalClipDurationMs = 0
  outputRenderStats.maxVerticalClipDurationMs = 0
  outputRenderStats.lastVerticalClipDurationMs = 0
  outputRenderStats.totalWriteLineCalls = 0
  outputRenderStats.totalWriteLineChars = 0
  outputRenderStats.totalClusteredChars = 0
  outputRenderStats.lineCacheHits = 0
  outputRenderStats.lineCacheMisses = 0
  outputRenderStats.plainAsciiMaterializeCount = 0
  outputRenderStats.tokenizedMaterializeCount = 0
  outputRenderStats.totalMaterializeDurationMs = 0
  outputRenderStats.maxMaterializeDurationMs = 0
  outputRenderStats.lastMaterializeDurationMs = 0
  outputRenderStats.totalWriteLineDurationMs = 0
  outputRenderStats.maxWriteLineDurationMs = 0
  outputRenderStats.lastWriteLineDurationMs = 0
  outputRenderStats.totalWriteLoopDurationMs = 0
  outputRenderStats.maxWriteLoopDurationMs = 0
  outputRenderStats.lastWriteLoopDurationMs = 0
}
