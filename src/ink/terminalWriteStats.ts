import type { Patch } from './frame.js'

export type TerminalPatchType = Patch['type']

type PatchTypeCounts = Readonly<Record<TerminalPatchType, number>>

export type TerminalWriteStatsSnapshot = {
  writeCalls: number
  totalInputPatches: number
  maxInputPatchCount: number
  patchTypeCounts: PatchTypeCounts
  syncWrappedCalls: number
  totalSerializedBytes: number
  maxSerializedBytes: number
  totalStdoutPatchBytes: number
  maxStdoutPatchBytes: number
  lastStdoutPatchBytes: number
  lastStdoutPatchCount: number
  totalSerializeDurationMs: number
  maxSerializeDurationMs: number
  lastSerializeDurationMs: number
  lastSerializedBytes: number
  lastInputPatchCount: number
  lastUseSync: boolean
}

const INITIAL_PATCH_TYPE_COUNTS: Record<TerminalPatchType, number> = {
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

let stats: TerminalWriteStatsSnapshot = makeInitialStats()

function makeInitialStats(): TerminalWriteStatsSnapshot {
  return {
    writeCalls: 0,
    totalInputPatches: 0,
    maxInputPatchCount: 0,
    patchTypeCounts: { ...INITIAL_PATCH_TYPE_COUNTS },
    syncWrappedCalls: 0,
    totalSerializedBytes: 0,
    maxSerializedBytes: 0,
    totalStdoutPatchBytes: 0,
    maxStdoutPatchBytes: 0,
    lastStdoutPatchBytes: 0,
    lastStdoutPatchCount: 0,
    totalSerializeDurationMs: 0,
    maxSerializeDurationMs: 0,
    lastSerializeDurationMs: 0,
    lastSerializedBytes: 0,
    lastInputPatchCount: 0,
    lastUseSync: false,
  }
}

export function resetTerminalWriteStatsForTesting(): void {
  stats = makeInitialStats()
}

export function recordTerminalWriteStats(params: {
  inputPatchTypes: ReadonlyArray<TerminalPatchType>
  serializedBytes: number
  useSync: boolean
  serializeDurationMs: number
  stdoutPatchBytes: number
  stdoutPatchCount: number
}): void {
  const nextCounts = { ...stats.patchTypeCounts }
  for (const type of params.inputPatchTypes) {
    nextCounts[type] += 1
  }
  stats = {
    ...stats,
    writeCalls: stats.writeCalls + 1,
    totalInputPatches: stats.totalInputPatches + params.inputPatchTypes.length,
    maxInputPatchCount: Math.max(
      stats.maxInputPatchCount,
      params.inputPatchTypes.length,
    ),
    patchTypeCounts: nextCounts,
    syncWrappedCalls: stats.syncWrappedCalls + (params.useSync ? 1 : 0),
    totalSerializedBytes: stats.totalSerializedBytes + params.serializedBytes,
    maxSerializedBytes: Math.max(stats.maxSerializedBytes, params.serializedBytes),
    totalStdoutPatchBytes: stats.totalStdoutPatchBytes + params.stdoutPatchBytes,
    maxStdoutPatchBytes: Math.max(
      stats.maxStdoutPatchBytes,
      params.stdoutPatchBytes,
    ),
    lastStdoutPatchBytes: params.stdoutPatchBytes,
    lastStdoutPatchCount: params.stdoutPatchCount,
    totalSerializeDurationMs:
      stats.totalSerializeDurationMs + params.serializeDurationMs,
    maxSerializeDurationMs: Math.max(
      stats.maxSerializeDurationMs,
      params.serializeDurationMs,
    ),
    lastSerializeDurationMs: params.serializeDurationMs,
    lastSerializedBytes: params.serializedBytes,
    lastInputPatchCount: params.inputPatchTypes.length,
    lastUseSync: params.useSync,
  }
}

export function getTerminalWriteStatsSnapshot(): TerminalWriteStatsSnapshot {
  return {
    ...stats,
    patchTypeCounts: { ...stats.patchTypeCounts },
  }
}
