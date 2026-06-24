export type LogUpdateRenderStatsSnapshot = {
  totalIncrementalDiffDurationMs: number
  maxIncrementalDiffDurationMs: number
  lastIncrementalDiffDurationMs: number
  totalIncrementalDiffCallbackDurationMs: number
  maxIncrementalDiffCallbackDurationMs: number
  lastIncrementalDiffCallbackDurationMs: number
  renderFrameSliceCalls: number
  totalRenderFrameSliceDurationMs: number
  maxRenderFrameSliceDurationMs: number
  lastRenderFrameSliceDurationMs: number
  totalVisibleCellLookupDurationMs: number
  maxVisibleCellLookupDurationMs: number
  lastVisibleCellLookupDurationMs: number
  totalMoveCursorDurationMs: number
  maxMoveCursorDurationMs: number
  lastMoveCursorDurationMs: number
  totalHyperlinkTransitionDurationMs: number
  maxHyperlinkTransitionDurationMs: number
  lastHyperlinkTransitionDurationMs: number
  totalStyleTransitionDurationMs: number
  maxStyleTransitionDurationMs: number
  lastStyleTransitionDurationMs: number
  totalWriteCellDurationMs: number
  maxWriteCellDurationMs: number
  lastWriteCellDurationMs: number
  totalRows: number
  totalVisibleCells: number
  totalSkippedCells: number
  totalRowAdvanceBranchHits: number
  totalRowEndCrlfCount: number
  totalSpacerSkips: number
  totalEmptySkips: number
  totalFgOnlySpaceSameStyleSkips: number
  totalVisibleReturns: number
  totalWriteCellCalls: number
  totalWriteCellSuccesses: number
  totalWriteCellFailures: number
  totalBufferedStdoutRuns: number
  totalBufferedStdoutCells: number
  totalBufferedStdoutBytes: number
  totalBufferedGapFillCalls: number
  totalBufferedGapFillCells: number
  totalBufferedNextRowPrefixFillCalls: number
  totalBufferedNextRowPrefixFillCells: number
  totalStyleStrNonEmpty: number
  totalWideEdgeSkips: number
  totalNeedsWidthCompensation: number
  totalWideCellsWritten: number
  totalMoveCursorCalls: number
  totalNoopMoveCursorCalls: number
  totalSameLineMoveCursorCalls: number
  totalLineChangeMoveCursorCalls: number
  totalLineChangeNextRowHomeCalls: number
  totalLineChangeNextRowOffsetCalls: number
  totalLineChangeMultiRowHomeCalls: number
  totalLineChangeMultiRowOffsetCalls: number
  totalPendingWrapMoveCursorCalls: number
  totalGapAnalysisCalls: number
  totalIncrementalGapFillCandidateCalls: number
  totalIncrementalGapFillCandidateCells: number
  totalIncrementalTailClearShortcutCalls: number
  totalPartialGapFillCandidateCalls: number
  totalPartialGapFillCandidateCells: number
  totalGapBlockedByActiveHyperlink: number
  totalGapBlockedByContentEnd: number
  totalGapBlockedByNonSpaceChar: number
  totalGapBlockedBySpaceMetadata: number
  totalGapBlockedByDefaultStyleMismatch: number
  totalGapBlockedByFgStyleMismatch: number
  totalNextRowPrefixAnalysisCalls: number
  totalNextRowPrefixPartialGapFillCandidateCalls: number
  totalNextRowPrefixPartialGapFillCandidateCells: number
  totalNextRowPrefixPartialRemainingDistanceCalls: number
  totalNextRowPrefixPartialRemainingDistanceCells: number
  maxNextRowPrefixPartialRemainingDistanceCells: number
  totalNextRowPrefixBlockedByActiveHyperlink: number
  totalNextRowPrefixBlockedByContentEnd: number
  totalNextRowPrefixBlockedByNonSpaceChar: number
  totalNextRowPrefixBlockedBySpaceMetadata: number
  totalNextRowPrefixBlockedByDefaultStyleMismatch: number
  totalNextRowPrefixBlockedByFgStyleMismatch: number
  totalNextRowContentEndZeroCalls: number
  totalNextRowContentEndZeroPendingWrapCalls: number
  totalNextRowContentEndZeroRemovedOnlyCalls: number
  totalNextRowContentEndZeroAddedOnlyCalls: number
  totalNextRowContentEndZeroRemovedAndAddedCalls: number
  totalNextRowContentEndZeroEmptyTargetCalls: number
  totalNextRowContentEndZeroNonEmptyTargetCalls: number
  totalNextRowContentEndZeroNonEmptyTargetVisibleCharCalls: number
  totalNextRowContentEndZeroNonEmptyTargetStyledSpaceCalls: number
  totalNextRowContentEndZeroNonEmptyTargetSpacerCalls: number
  totalNextRowContentEndPositiveCalls: number
  totalIncrementalTailClearCalls: number
  totalIncrementalTailClearCells: number
}

const logUpdateRenderStats: LogUpdateRenderStatsSnapshot = {
  totalIncrementalDiffDurationMs: 0,
  maxIncrementalDiffDurationMs: 0,
  lastIncrementalDiffDurationMs: 0,
  totalIncrementalDiffCallbackDurationMs: 0,
  maxIncrementalDiffCallbackDurationMs: 0,
  lastIncrementalDiffCallbackDurationMs: 0,
  renderFrameSliceCalls: 0,
  totalRenderFrameSliceDurationMs: 0,
  maxRenderFrameSliceDurationMs: 0,
  lastRenderFrameSliceDurationMs: 0,
  totalVisibleCellLookupDurationMs: 0,
  maxVisibleCellLookupDurationMs: 0,
  lastVisibleCellLookupDurationMs: 0,
  totalMoveCursorDurationMs: 0,
  maxMoveCursorDurationMs: 0,
  lastMoveCursorDurationMs: 0,
  totalHyperlinkTransitionDurationMs: 0,
  maxHyperlinkTransitionDurationMs: 0,
  lastHyperlinkTransitionDurationMs: 0,
  totalStyleTransitionDurationMs: 0,
  maxStyleTransitionDurationMs: 0,
  lastStyleTransitionDurationMs: 0,
  totalWriteCellDurationMs: 0,
  maxWriteCellDurationMs: 0,
  lastWriteCellDurationMs: 0,
  totalRows: 0,
  totalVisibleCells: 0,
  totalSkippedCells: 0,
  totalRowAdvanceBranchHits: 0,
  totalRowEndCrlfCount: 0,
  totalSpacerSkips: 0,
  totalEmptySkips: 0,
  totalFgOnlySpaceSameStyleSkips: 0,
  totalVisibleReturns: 0,
  totalWriteCellCalls: 0,
  totalWriteCellSuccesses: 0,
  totalWriteCellFailures: 0,
  totalBufferedStdoutRuns: 0,
  totalBufferedStdoutCells: 0,
  totalBufferedStdoutBytes: 0,
  totalBufferedGapFillCalls: 0,
  totalBufferedGapFillCells: 0,
  totalBufferedNextRowPrefixFillCalls: 0,
  totalBufferedNextRowPrefixFillCells: 0,
  totalStyleStrNonEmpty: 0,
  totalWideEdgeSkips: 0,
  totalNeedsWidthCompensation: 0,
  totalWideCellsWritten: 0,
  totalMoveCursorCalls: 0,
  totalNoopMoveCursorCalls: 0,
  totalSameLineMoveCursorCalls: 0,
  totalLineChangeMoveCursorCalls: 0,
  totalLineChangeNextRowHomeCalls: 0,
  totalLineChangeNextRowOffsetCalls: 0,
  totalLineChangeMultiRowHomeCalls: 0,
  totalLineChangeMultiRowOffsetCalls: 0,
  totalPendingWrapMoveCursorCalls: 0,
  totalGapAnalysisCalls: 0,
  totalIncrementalGapFillCandidateCalls: 0,
  totalIncrementalGapFillCandidateCells: 0,
  totalIncrementalTailClearShortcutCalls: 0,
  totalPartialGapFillCandidateCalls: 0,
  totalPartialGapFillCandidateCells: 0,
  totalGapBlockedByActiveHyperlink: 0,
  totalGapBlockedByContentEnd: 0,
  totalGapBlockedByNonSpaceChar: 0,
  totalGapBlockedBySpaceMetadata: 0,
  totalGapBlockedByDefaultStyleMismatch: 0,
  totalGapBlockedByFgStyleMismatch: 0,
  totalNextRowPrefixAnalysisCalls: 0,
  totalNextRowPrefixPartialGapFillCandidateCalls: 0,
  totalNextRowPrefixPartialGapFillCandidateCells: 0,
  totalNextRowPrefixPartialRemainingDistanceCalls: 0,
  totalNextRowPrefixPartialRemainingDistanceCells: 0,
  maxNextRowPrefixPartialRemainingDistanceCells: 0,
  totalNextRowPrefixBlockedByActiveHyperlink: 0,
  totalNextRowPrefixBlockedByContentEnd: 0,
  totalNextRowPrefixBlockedByNonSpaceChar: 0,
  totalNextRowPrefixBlockedBySpaceMetadata: 0,
  totalNextRowPrefixBlockedByDefaultStyleMismatch: 0,
  totalNextRowPrefixBlockedByFgStyleMismatch: 0,
  totalNextRowContentEndZeroCalls: 0,
  totalNextRowContentEndZeroPendingWrapCalls: 0,
  totalNextRowContentEndZeroRemovedOnlyCalls: 0,
  totalNextRowContentEndZeroAddedOnlyCalls: 0,
  totalNextRowContentEndZeroRemovedAndAddedCalls: 0,
  totalNextRowContentEndZeroEmptyTargetCalls: 0,
  totalNextRowContentEndZeroNonEmptyTargetCalls: 0,
  totalNextRowContentEndZeroNonEmptyTargetVisibleCharCalls: 0,
  totalNextRowContentEndZeroNonEmptyTargetStyledSpaceCalls: 0,
  totalNextRowContentEndZeroNonEmptyTargetSpacerCalls: 0,
  totalNextRowContentEndPositiveCalls: 0,
  totalIncrementalTailClearCalls: 0,
  totalIncrementalTailClearCells: 0,
}

export function recordIncrementalDiffStats(stats: {
  incrementalDiffDurationMs: number
  incrementalDiffCallbackDurationMs: number
}): void {
  logUpdateRenderStats.totalIncrementalDiffDurationMs +=
    stats.incrementalDiffDurationMs
  logUpdateRenderStats.maxIncrementalDiffDurationMs = Math.max(
    logUpdateRenderStats.maxIncrementalDiffDurationMs,
    stats.incrementalDiffDurationMs,
  )
  logUpdateRenderStats.lastIncrementalDiffDurationMs =
    stats.incrementalDiffDurationMs
  logUpdateRenderStats.totalIncrementalDiffCallbackDurationMs +=
    stats.incrementalDiffCallbackDurationMs
  logUpdateRenderStats.maxIncrementalDiffCallbackDurationMs = Math.max(
    logUpdateRenderStats.maxIncrementalDiffCallbackDurationMs,
    stats.incrementalDiffCallbackDurationMs,
  )
  logUpdateRenderStats.lastIncrementalDiffCallbackDurationMs =
    stats.incrementalDiffCallbackDurationMs
}

export function recordRenderFrameSliceStats(stats: {
  renderFrameSliceDurationMs: number
  visibleCellLookupDurationMs: number
  moveCursorDurationMs: number
  hyperlinkTransitionDurationMs: number
  styleTransitionDurationMs: number
  writeCellDurationMs: number
  rows: number
  visibleCells: number
  skippedCells: number
  rowAdvanceBranchHits: number
  rowEndCrlfCount: number
  writeCellCalls: number
  writeCellSuccesses: number
  writeCellFailures: number
  bufferedStdoutRuns: number
  bufferedStdoutCells: number
  bufferedStdoutBytes: number
  bufferedGapFillCalls: number
  bufferedGapFillCells: number
}): void {
  logUpdateRenderStats.renderFrameSliceCalls += 1
  logUpdateRenderStats.totalRenderFrameSliceDurationMs +=
    stats.renderFrameSliceDurationMs
  logUpdateRenderStats.maxRenderFrameSliceDurationMs = Math.max(
    logUpdateRenderStats.maxRenderFrameSliceDurationMs,
    stats.renderFrameSliceDurationMs,
  )
  logUpdateRenderStats.lastRenderFrameSliceDurationMs =
    stats.renderFrameSliceDurationMs
  logUpdateRenderStats.totalVisibleCellLookupDurationMs +=
    stats.visibleCellLookupDurationMs
  logUpdateRenderStats.maxVisibleCellLookupDurationMs = Math.max(
    logUpdateRenderStats.maxVisibleCellLookupDurationMs,
    stats.visibleCellLookupDurationMs,
  )
  logUpdateRenderStats.lastVisibleCellLookupDurationMs =
    stats.visibleCellLookupDurationMs
  logUpdateRenderStats.totalMoveCursorDurationMs += stats.moveCursorDurationMs
  logUpdateRenderStats.maxMoveCursorDurationMs = Math.max(
    logUpdateRenderStats.maxMoveCursorDurationMs,
    stats.moveCursorDurationMs,
  )
  logUpdateRenderStats.lastMoveCursorDurationMs = stats.moveCursorDurationMs
  logUpdateRenderStats.totalHyperlinkTransitionDurationMs +=
    stats.hyperlinkTransitionDurationMs
  logUpdateRenderStats.maxHyperlinkTransitionDurationMs = Math.max(
    logUpdateRenderStats.maxHyperlinkTransitionDurationMs,
    stats.hyperlinkTransitionDurationMs,
  )
  logUpdateRenderStats.lastHyperlinkTransitionDurationMs =
    stats.hyperlinkTransitionDurationMs
  logUpdateRenderStats.totalStyleTransitionDurationMs +=
    stats.styleTransitionDurationMs
  logUpdateRenderStats.maxStyleTransitionDurationMs = Math.max(
    logUpdateRenderStats.maxStyleTransitionDurationMs,
    stats.styleTransitionDurationMs,
  )
  logUpdateRenderStats.lastStyleTransitionDurationMs =
    stats.styleTransitionDurationMs
  logUpdateRenderStats.totalWriteCellDurationMs += stats.writeCellDurationMs
  logUpdateRenderStats.maxWriteCellDurationMs = Math.max(
    logUpdateRenderStats.maxWriteCellDurationMs,
    stats.writeCellDurationMs,
  )
  logUpdateRenderStats.lastWriteCellDurationMs = stats.writeCellDurationMs
  logUpdateRenderStats.totalRows += stats.rows
  logUpdateRenderStats.totalVisibleCells += stats.visibleCells
  logUpdateRenderStats.totalSkippedCells += stats.skippedCells
  logUpdateRenderStats.totalRowAdvanceBranchHits += stats.rowAdvanceBranchHits
  logUpdateRenderStats.totalRowEndCrlfCount += stats.rowEndCrlfCount
  logUpdateRenderStats.totalWriteCellCalls += stats.writeCellCalls
  logUpdateRenderStats.totalWriteCellSuccesses += stats.writeCellSuccesses
  logUpdateRenderStats.totalWriteCellFailures += stats.writeCellFailures
  logUpdateRenderStats.totalBufferedStdoutRuns += stats.bufferedStdoutRuns
  logUpdateRenderStats.totalBufferedStdoutCells += stats.bufferedStdoutCells
  logUpdateRenderStats.totalBufferedStdoutBytes += stats.bufferedStdoutBytes
  logUpdateRenderStats.totalBufferedGapFillCalls += stats.bufferedGapFillCalls
  logUpdateRenderStats.totalBufferedGapFillCells += stats.bufferedGapFillCells
}

export function recordVisibleCellAtIndexResult(
  kind: 'spacer' | 'empty' | 'fg-only-space-same-style' | 'visible',
): void {
  if (kind === 'spacer') {
    logUpdateRenderStats.totalSpacerSkips += 1
  } else if (kind === 'empty') {
    logUpdateRenderStats.totalEmptySkips += 1
  } else if (kind === 'fg-only-space-same-style') {
    logUpdateRenderStats.totalFgOnlySpaceSameStyleSkips += 1
  } else {
    logUpdateRenderStats.totalVisibleReturns += 1
  }
}

export function recordMoveCursorStats(
  kind:
    | 'noop'
    | 'same-line'
    | 'line-change'
    | 'line-change-next-row-home'
    | 'line-change-next-row-offset'
    | 'line-change-multi-row-home'
    | 'line-change-multi-row-offset'
    | 'pending-wrap',
): void {
  logUpdateRenderStats.totalMoveCursorCalls += 1
  if (kind === 'noop') {
    logUpdateRenderStats.totalNoopMoveCursorCalls += 1
  } else if (kind === 'same-line') {
    logUpdateRenderStats.totalSameLineMoveCursorCalls += 1
  } else if (kind === 'line-change' || kind.startsWith('line-change-')) {
    logUpdateRenderStats.totalLineChangeMoveCursorCalls += 1
    if (kind === 'line-change-next-row-home') {
      logUpdateRenderStats.totalLineChangeNextRowHomeCalls += 1
    } else if (kind === 'line-change-next-row-offset') {
      logUpdateRenderStats.totalLineChangeNextRowOffsetCalls += 1
    } else if (kind === 'line-change-multi-row-home') {
      logUpdateRenderStats.totalLineChangeMultiRowHomeCalls += 1
    } else if (kind === 'line-change-multi-row-offset') {
      logUpdateRenderStats.totalLineChangeMultiRowOffsetCalls += 1
    }
  } else {
    logUpdateRenderStats.totalPendingWrapMoveCursorCalls += 1
  }
}

export function recordIncrementalGapFillCandidate(cells: number): void {
  if (cells <= 0) {
    return
  }
  logUpdateRenderStats.totalIncrementalGapFillCandidateCalls += 1
  logUpdateRenderStats.totalIncrementalGapFillCandidateCells += cells
}

export function recordIncrementalTailClearShortcut(): void {
  logUpdateRenderStats.totalIncrementalTailClearShortcutCalls += 1
}

export function recordGapFillAnalysis(
  stats:
    | {
        fillableCells: number
        blocker:
          | 'none'
          | 'active-hyperlink'
          | 'invalid-range'
          | 'content-end'
          | 'non-space-char'
          | 'space-metadata'
          | 'default-style-mismatch'
          | 'fg-style-mismatch'
      }
    | null,
): void {
  if (!stats) {
    return
  }

  logUpdateRenderStats.totalGapAnalysisCalls += 1

  if (stats.blocker === 'none') {
    return
  }

  if (stats.fillableCells > 0) {
    logUpdateRenderStats.totalPartialGapFillCandidateCalls += 1
    logUpdateRenderStats.totalPartialGapFillCandidateCells += stats.fillableCells
  }

  switch (stats.blocker) {
    case 'active-hyperlink':
      logUpdateRenderStats.totalGapBlockedByActiveHyperlink += 1
      return
    case 'content-end':
      logUpdateRenderStats.totalGapBlockedByContentEnd += 1
      return
    case 'non-space-char':
      logUpdateRenderStats.totalGapBlockedByNonSpaceChar += 1
      return
    case 'space-metadata':
      logUpdateRenderStats.totalGapBlockedBySpaceMetadata += 1
      return
    case 'default-style-mismatch':
      logUpdateRenderStats.totalGapBlockedByDefaultStyleMismatch += 1
      return
    case 'fg-style-mismatch':
      logUpdateRenderStats.totalGapBlockedByFgStyleMismatch += 1
      return
    case 'invalid-range':
      return
  }
}

export function recordBufferedGapFill(cells: number): void {
  if (cells <= 0) {
    return
  }
  logUpdateRenderStats.totalBufferedGapFillCalls += 1
  logUpdateRenderStats.totalBufferedGapFillCells += cells
}

export function recordBufferedNextRowPrefixFill(cells: number): void {
  if (cells <= 0) {
    return
  }
  logUpdateRenderStats.totalBufferedNextRowPrefixFillCalls += 1
  logUpdateRenderStats.totalBufferedNextRowPrefixFillCells += cells
}

export function recordNextRowPrefixAnalysis(
  stats:
    | {
        fillableCells: number
        blocker:
          | 'none'
          | 'active-hyperlink'
          | 'invalid-range'
          | 'content-end'
          | 'non-space-char'
          | 'space-metadata'
          | 'default-style-mismatch'
          | 'fg-style-mismatch'
      }
    | null,
): void {
  if (!stats) {
    return
  }

  logUpdateRenderStats.totalNextRowPrefixAnalysisCalls += 1

  if (stats.blocker === 'none') {
    return
  }

  if (stats.fillableCells > 0) {
    logUpdateRenderStats.totalNextRowPrefixPartialGapFillCandidateCalls += 1
    logUpdateRenderStats.totalNextRowPrefixPartialGapFillCandidateCells +=
      stats.fillableCells
  }

  switch (stats.blocker) {
    case 'active-hyperlink':
      logUpdateRenderStats.totalNextRowPrefixBlockedByActiveHyperlink += 1
      return
    case 'content-end':
      logUpdateRenderStats.totalNextRowPrefixBlockedByContentEnd += 1
      return
    case 'non-space-char':
      logUpdateRenderStats.totalNextRowPrefixBlockedByNonSpaceChar += 1
      return
    case 'space-metadata':
      logUpdateRenderStats.totalNextRowPrefixBlockedBySpaceMetadata += 1
      return
    case 'default-style-mismatch':
      logUpdateRenderStats.totalNextRowPrefixBlockedByDefaultStyleMismatch += 1
      return
    case 'fg-style-mismatch':
      logUpdateRenderStats.totalNextRowPrefixBlockedByFgStyleMismatch += 1
      return
    case 'invalid-range':
      return
  }
}

export function recordNextRowPrefixPartialRemainingDistance(
  remainingCells: number,
): void {
  if (remainingCells <= 0) {
    return
  }

  logUpdateRenderStats.totalNextRowPrefixPartialRemainingDistanceCalls += 1
  logUpdateRenderStats.totalNextRowPrefixPartialRemainingDistanceCells +=
    remainingCells
  logUpdateRenderStats.maxNextRowPrefixPartialRemainingDistanceCells = Math.max(
    logUpdateRenderStats.maxNextRowPrefixPartialRemainingDistanceCells,
    remainingCells,
  )
}

export function recordNextRowContentEndFallback(stats: {
  nextRowContentEnd: number
  pendingWrap: boolean
  hasRemoved: boolean
  hasAdded: boolean
  nextCellEmpty: boolean
  nextCellKind?: 'visible-char' | 'styled-space' | 'spacer'
}): void {
  if (stats.nextRowContentEnd === 0) {
    logUpdateRenderStats.totalNextRowContentEndZeroCalls += 1
    if (stats.pendingWrap) {
      logUpdateRenderStats.totalNextRowContentEndZeroPendingWrapCalls += 1
    }
    if (stats.hasRemoved && stats.hasAdded) {
      logUpdateRenderStats.totalNextRowContentEndZeroRemovedAndAddedCalls += 1
    } else if (stats.hasRemoved) {
      logUpdateRenderStats.totalNextRowContentEndZeroRemovedOnlyCalls += 1
    } else if (stats.hasAdded) {
      logUpdateRenderStats.totalNextRowContentEndZeroAddedOnlyCalls += 1
    }
    if (stats.nextCellEmpty) {
      logUpdateRenderStats.totalNextRowContentEndZeroEmptyTargetCalls += 1
    } else {
      logUpdateRenderStats.totalNextRowContentEndZeroNonEmptyTargetCalls += 1
      if (stats.nextCellKind === 'visible-char') {
        logUpdateRenderStats.totalNextRowContentEndZeroNonEmptyTargetVisibleCharCalls += 1
      } else if (stats.nextCellKind === 'styled-space') {
        logUpdateRenderStats.totalNextRowContentEndZeroNonEmptyTargetStyledSpaceCalls += 1
      } else if (stats.nextCellKind === 'spacer') {
        logUpdateRenderStats.totalNextRowContentEndZeroNonEmptyTargetSpacerCalls += 1
      }
    }
    return
  }

  logUpdateRenderStats.totalNextRowContentEndPositiveCalls += 1
}

export function recordIncrementalTailClear(cells: number): void {
  logUpdateRenderStats.totalIncrementalTailClearCalls += 1
  if (cells > 0) {
    logUpdateRenderStats.totalIncrementalTailClearCells += cells
  }
}

export function recordWriteCellStats(stats: {
  styleStrNonEmpty: boolean
  wideEdgeSkip: boolean
  needsWidthCompensation: boolean
  wideCell: boolean
}): void {
  if (stats.styleStrNonEmpty) {
    logUpdateRenderStats.totalStyleStrNonEmpty += 1
  }
  if (stats.wideEdgeSkip) {
    logUpdateRenderStats.totalWideEdgeSkips += 1
  }
  if (stats.needsWidthCompensation) {
    logUpdateRenderStats.totalNeedsWidthCompensation += 1
  }
  if (stats.wideCell) {
    logUpdateRenderStats.totalWideCellsWritten += 1
  }
}

export function getLogUpdateRenderStatsSnapshot(): LogUpdateRenderStatsSnapshot {
  return { ...logUpdateRenderStats }
}

export function resetLogUpdateRenderStatsForTesting(): void {
  logUpdateRenderStats.totalIncrementalDiffDurationMs = 0
  logUpdateRenderStats.maxIncrementalDiffDurationMs = 0
  logUpdateRenderStats.lastIncrementalDiffDurationMs = 0
  logUpdateRenderStats.totalIncrementalDiffCallbackDurationMs = 0
  logUpdateRenderStats.maxIncrementalDiffCallbackDurationMs = 0
  logUpdateRenderStats.lastIncrementalDiffCallbackDurationMs = 0
  logUpdateRenderStats.renderFrameSliceCalls = 0
  logUpdateRenderStats.totalRenderFrameSliceDurationMs = 0
  logUpdateRenderStats.maxRenderFrameSliceDurationMs = 0
  logUpdateRenderStats.lastRenderFrameSliceDurationMs = 0
  logUpdateRenderStats.totalVisibleCellLookupDurationMs = 0
  logUpdateRenderStats.maxVisibleCellLookupDurationMs = 0
  logUpdateRenderStats.lastVisibleCellLookupDurationMs = 0
  logUpdateRenderStats.totalMoveCursorDurationMs = 0
  logUpdateRenderStats.maxMoveCursorDurationMs = 0
  logUpdateRenderStats.lastMoveCursorDurationMs = 0
  logUpdateRenderStats.totalHyperlinkTransitionDurationMs = 0
  logUpdateRenderStats.maxHyperlinkTransitionDurationMs = 0
  logUpdateRenderStats.lastHyperlinkTransitionDurationMs = 0
  logUpdateRenderStats.totalStyleTransitionDurationMs = 0
  logUpdateRenderStats.maxStyleTransitionDurationMs = 0
  logUpdateRenderStats.lastStyleTransitionDurationMs = 0
  logUpdateRenderStats.totalWriteCellDurationMs = 0
  logUpdateRenderStats.maxWriteCellDurationMs = 0
  logUpdateRenderStats.lastWriteCellDurationMs = 0
  logUpdateRenderStats.totalRows = 0
  logUpdateRenderStats.totalVisibleCells = 0
  logUpdateRenderStats.totalSkippedCells = 0
  logUpdateRenderStats.totalRowAdvanceBranchHits = 0
  logUpdateRenderStats.totalRowEndCrlfCount = 0
  logUpdateRenderStats.totalSpacerSkips = 0
  logUpdateRenderStats.totalEmptySkips = 0
  logUpdateRenderStats.totalFgOnlySpaceSameStyleSkips = 0
  logUpdateRenderStats.totalVisibleReturns = 0
  logUpdateRenderStats.totalWriteCellCalls = 0
  logUpdateRenderStats.totalWriteCellSuccesses = 0
  logUpdateRenderStats.totalWriteCellFailures = 0
  logUpdateRenderStats.totalBufferedStdoutRuns = 0
  logUpdateRenderStats.totalBufferedStdoutCells = 0
  logUpdateRenderStats.totalBufferedStdoutBytes = 0
  logUpdateRenderStats.totalBufferedGapFillCalls = 0
  logUpdateRenderStats.totalBufferedGapFillCells = 0
  logUpdateRenderStats.totalBufferedNextRowPrefixFillCalls = 0
  logUpdateRenderStats.totalBufferedNextRowPrefixFillCells = 0
  logUpdateRenderStats.totalStyleStrNonEmpty = 0
  logUpdateRenderStats.totalWideEdgeSkips = 0
  logUpdateRenderStats.totalNeedsWidthCompensation = 0
  logUpdateRenderStats.totalWideCellsWritten = 0
  logUpdateRenderStats.totalMoveCursorCalls = 0
  logUpdateRenderStats.totalNoopMoveCursorCalls = 0
  logUpdateRenderStats.totalSameLineMoveCursorCalls = 0
  logUpdateRenderStats.totalLineChangeMoveCursorCalls = 0
  logUpdateRenderStats.totalLineChangeNextRowHomeCalls = 0
  logUpdateRenderStats.totalLineChangeNextRowOffsetCalls = 0
  logUpdateRenderStats.totalLineChangeMultiRowHomeCalls = 0
  logUpdateRenderStats.totalLineChangeMultiRowOffsetCalls = 0
  logUpdateRenderStats.totalPendingWrapMoveCursorCalls = 0
  logUpdateRenderStats.totalGapAnalysisCalls = 0
  logUpdateRenderStats.totalIncrementalGapFillCandidateCalls = 0
  logUpdateRenderStats.totalIncrementalGapFillCandidateCells = 0
  logUpdateRenderStats.totalIncrementalTailClearShortcutCalls = 0
  logUpdateRenderStats.totalPartialGapFillCandidateCalls = 0
  logUpdateRenderStats.totalPartialGapFillCandidateCells = 0
  logUpdateRenderStats.totalGapBlockedByActiveHyperlink = 0
  logUpdateRenderStats.totalGapBlockedByContentEnd = 0
  logUpdateRenderStats.totalGapBlockedByNonSpaceChar = 0
  logUpdateRenderStats.totalGapBlockedBySpaceMetadata = 0
  logUpdateRenderStats.totalGapBlockedByDefaultStyleMismatch = 0
  logUpdateRenderStats.totalGapBlockedByFgStyleMismatch = 0
  logUpdateRenderStats.totalNextRowPrefixAnalysisCalls = 0
  logUpdateRenderStats.totalNextRowPrefixPartialGapFillCandidateCalls = 0
  logUpdateRenderStats.totalNextRowPrefixPartialGapFillCandidateCells = 0
  logUpdateRenderStats.totalNextRowPrefixPartialRemainingDistanceCalls = 0
  logUpdateRenderStats.totalNextRowPrefixPartialRemainingDistanceCells = 0
  logUpdateRenderStats.maxNextRowPrefixPartialRemainingDistanceCells = 0
  logUpdateRenderStats.totalNextRowPrefixBlockedByActiveHyperlink = 0
  logUpdateRenderStats.totalNextRowPrefixBlockedByContentEnd = 0
  logUpdateRenderStats.totalNextRowPrefixBlockedByNonSpaceChar = 0
  logUpdateRenderStats.totalNextRowPrefixBlockedBySpaceMetadata = 0
  logUpdateRenderStats.totalNextRowPrefixBlockedByDefaultStyleMismatch = 0
  logUpdateRenderStats.totalNextRowPrefixBlockedByFgStyleMismatch = 0
  logUpdateRenderStats.totalIncrementalTailClearCalls = 0
  logUpdateRenderStats.totalIncrementalTailClearCells = 0
}
