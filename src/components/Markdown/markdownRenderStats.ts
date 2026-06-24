type CodeFenceFormatStat = {
  codeLength: number
  language: string | null
  durationMs: number
}

export type MarkdownRenderStatsSnapshot = {
  buildCalls: number
  totalBuildDurationMs: number
  maxBuildDurationMs: number
  codeFenceFormatCalls: number
  codeFenceFormatTotalMs: number
  codeFenceFormatMaxMs: number
  lastCodeFenceFormat: CodeFenceFormatStat | null
}

let stats: MarkdownRenderStatsSnapshot = makeInitialStats()

function makeInitialStats(): MarkdownRenderStatsSnapshot {
  return {
    buildCalls: 0,
    totalBuildDurationMs: 0,
    maxBuildDurationMs: 0,
    codeFenceFormatCalls: 0,
    codeFenceFormatTotalMs: 0,
    codeFenceFormatMaxMs: 0,
    lastCodeFenceFormat: null,
  }
}

export function resetMarkdownRenderStatsForTesting(): void {
  stats = makeInitialStats()
}

export function recordMarkdownRenderBuild(durationMs: number): void {
  stats = {
    ...stats,
    buildCalls: stats.buildCalls + 1,
    totalBuildDurationMs: stats.totalBuildDurationMs + durationMs,
    maxBuildDurationMs: Math.max(stats.maxBuildDurationMs, durationMs),
  }
}

export function recordMarkdownCodeFenceFormat(params: CodeFenceFormatStat): void {
  stats = {
    ...stats,
    codeFenceFormatCalls: stats.codeFenceFormatCalls + 1,
    codeFenceFormatTotalMs: stats.codeFenceFormatTotalMs + params.durationMs,
    codeFenceFormatMaxMs: Math.max(stats.codeFenceFormatMaxMs, params.durationMs),
    lastCodeFenceFormat: { ...params },
  }
}

export function getMarkdownRenderStatsSnapshot(): MarkdownRenderStatsSnapshot {
  return {
    ...stats,
    lastCodeFenceFormat: stats.lastCodeFenceFormat
      ? { ...stats.lastCodeFenceFormat }
      : null,
  }
}
