import type { Patch } from './frame.js'

type PatchTypeCounts = Record<Patch['type'], number>

export type OptimizerStatsSnapshot = {
  optimizeCalls: number
  totalInputPatches: number
  maxInputPatchCount: number
  lastInputPatchCount: number
  totalOutputPatches: number
  maxOutputPatchCount: number
  lastOutputPatchCount: number
  inputPatchTypeCounts: PatchTypeCounts
  stdoutMergeCount: number
  noopCursorMoveDropCount: number
  cursorMoveMergeCount: number
  styleStrMergeCount: number
  cursorVisibilityCancelCount: number
}

function emptyPatchTypeCounts(): PatchTypeCounts {
  return {
    stdout: 0,
    clear: 0,
    clearTerminal: 0,
    cursorHide: 0,
    cursorShow: 0,
    cursorMove: 0,
    cursorTo: 0,
    carriageReturn: 0,
    hyperlink: 0,
    styleStr: 0,
  }
}

const optimizerStats: OptimizerStatsSnapshot = {
  optimizeCalls: 0,
  totalInputPatches: 0,
  maxInputPatchCount: 0,
  lastInputPatchCount: 0,
  totalOutputPatches: 0,
  maxOutputPatchCount: 0,
  lastOutputPatchCount: 0,
  inputPatchTypeCounts: emptyPatchTypeCounts(),
  stdoutMergeCount: 0,
  noopCursorMoveDropCount: 0,
  cursorMoveMergeCount: 0,
  styleStrMergeCount: 0,
  cursorVisibilityCancelCount: 0,
}

export function recordOptimizerStats(stats: {
  inputPatchCount: number
  inputPatchTypeCounts: PatchTypeCounts
  outputPatchCount: number
  stdoutMergeCount: number
  noopCursorMoveDropCount: number
  cursorMoveMergeCount: number
  styleStrMergeCount: number
  cursorVisibilityCancelCount: number
}): void {
  optimizerStats.optimizeCalls += 1
  optimizerStats.totalInputPatches += stats.inputPatchCount
  optimizerStats.maxInputPatchCount = Math.max(
    optimizerStats.maxInputPatchCount,
    stats.inputPatchCount,
  )
  optimizerStats.lastInputPatchCount = stats.inputPatchCount
  optimizerStats.totalOutputPatches += stats.outputPatchCount
  optimizerStats.maxOutputPatchCount = Math.max(
    optimizerStats.maxOutputPatchCount,
    stats.outputPatchCount,
  )
  optimizerStats.lastOutputPatchCount = stats.outputPatchCount
  optimizerStats.stdoutMergeCount += stats.stdoutMergeCount
  optimizerStats.noopCursorMoveDropCount += stats.noopCursorMoveDropCount
  optimizerStats.cursorMoveMergeCount += stats.cursorMoveMergeCount
  optimizerStats.styleStrMergeCount += stats.styleStrMergeCount
  optimizerStats.cursorVisibilityCancelCount +=
    stats.cursorVisibilityCancelCount

  for (const key of Object.keys(
    optimizerStats.inputPatchTypeCounts,
  ) as Array<keyof PatchTypeCounts>) {
    optimizerStats.inputPatchTypeCounts[key] += stats.inputPatchTypeCounts[key]
  }
}

export function getOptimizerStatsSnapshot(): OptimizerStatsSnapshot {
  return {
    optimizeCalls: optimizerStats.optimizeCalls,
    totalInputPatches: optimizerStats.totalInputPatches,
    maxInputPatchCount: optimizerStats.maxInputPatchCount,
    lastInputPatchCount: optimizerStats.lastInputPatchCount,
    totalOutputPatches: optimizerStats.totalOutputPatches,
    maxOutputPatchCount: optimizerStats.maxOutputPatchCount,
    lastOutputPatchCount: optimizerStats.lastOutputPatchCount,
    inputPatchTypeCounts: { ...optimizerStats.inputPatchTypeCounts },
    stdoutMergeCount: optimizerStats.stdoutMergeCount,
    noopCursorMoveDropCount: optimizerStats.noopCursorMoveDropCount,
    cursorMoveMergeCount: optimizerStats.cursorMoveMergeCount,
    styleStrMergeCount: optimizerStats.styleStrMergeCount,
    cursorVisibilityCancelCount: optimizerStats.cursorVisibilityCancelCount,
  }
}

export function resetOptimizerStatsForTesting(): void {
  optimizerStats.optimizeCalls = 0
  optimizerStats.totalInputPatches = 0
  optimizerStats.maxInputPatchCount = 0
  optimizerStats.lastInputPatchCount = 0
  optimizerStats.totalOutputPatches = 0
  optimizerStats.maxOutputPatchCount = 0
  optimizerStats.lastOutputPatchCount = 0
  optimizerStats.stdoutMergeCount = 0
  optimizerStats.noopCursorMoveDropCount = 0
  optimizerStats.cursorMoveMergeCount = 0
  optimizerStats.styleStrMergeCount = 0
  optimizerStats.cursorVisibilityCancelCount = 0
  optimizerStats.inputPatchTypeCounts = emptyPatchTypeCounts()
}
