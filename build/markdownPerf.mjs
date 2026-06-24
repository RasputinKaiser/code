import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rerunsFlagIndex = process.argv.indexOf('--reruns')
const reruns =
  rerunsFlagIndex >= 0
    ? Number.parseInt(process.argv[rerunsFlagIndex + 1] ?? '3', 10)
    : 3

if (!Number.isFinite(reruns) || reruns <= 0) {
  throw new Error(`invalid rerun count: ${process.argv[rerunsFlagIndex + 1]}`)
}

const { runMarkdownMountScenario } = await import(
  '../src/ink/markdownPerfScenarios.tsx'
)
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))

const results = []
for (let run = 0; run < reruns; run += 1) {
  results.push(await runMarkdownMountScenario())
}

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * p) - 1),
  )
  return sorted[index]
}

function unique(values) {
  return Array.from(new Set(values))
}

function summarize(label, summaries) {
  return {
    scenario: label,
    reruns: summaries.length,
    frames: percentile(summaries.map(summary => summary.frames), 0.95),
    totalBytes: percentile(summaries.map(summary => summary.totalBytes), 0.95),
    maxBytes: percentile(summaries.map(summary => summary.maxBytes), 0.95),
    totalDurationMs: percentile(
      summaries.map(summary => summary.totalDurationMs),
      0.95,
    ),
    maxDurationMs: percentile(
      summaries.map(summary => summary.maxDurationMs),
      0.95,
    ),
    maxMeasured: percentile(
      summaries.map(summary => summary.maxMeasured),
      0.95,
    ),
    maxVisited: percentile(
      summaries.map(summary => summary.maxVisited),
      0.95,
    ),
    totalPatches: percentile(
      summaries.map(summary => summary.totalPatches),
      0.95,
    ),
    maxPatches: percentile(
      summaries.map(summary => summary.maxPatches),
      0.95,
    ),
    flickerFrames: percentile(
      summaries.map(summary => summary.flickerFrames),
      0.95,
    ),
    fencedCodePaths: unique(
      summaries.map(summary => summary.fencedCode.lastPath ?? 'none'),
    ),
    fencedCodeFallbackReasons: unique(
      summaries
        .map(summary => summary.fencedCode.lastFallbackReason ?? 'none')
        .filter(reason => reason !== 'none'),
    ),
    nativeResolvedModuleIds: unique(
      summaries.map(summary => summary.nativeRenderer.resolvedModuleId ?? 'none'),
    ),
    nativeLastResultKinds: unique(
      summaries.map(summary => summary.nativeRenderer.lastResultKind),
    ),
    nativeRenderCalls: percentile(
      summaries.map(summary => summary.nativeRenderer.renderCalls),
      0.95,
    ),
    nativeInvalidReturns: percentile(
      summaries.map(summary => summary.nativeRenderer.invalidReturns),
      0.95,
    ),
    nativeRenderMaxMs: percentile(
      summaries.map(summary => summary.nativeRenderer.maxRenderDurationMs),
      0.95,
    ),
    codeFenceFormatCalls: percentile(
      summaries.map(summary => summary.markdownRender.codeFenceFormatCalls),
      0.95,
    ),
    codeFenceFormatTotalMs: percentile(
      summaries.map(summary => summary.markdownRender.codeFenceFormatTotalMs),
      0.95,
    ),
    codeFenceFormatMaxMs: percentile(
      summaries.map(summary => summary.markdownRender.codeFenceFormatMaxMs),
      0.95,
    ),
    rawAnsiJoinCalls: percentile(
      summaries.map(summary => summary.rawAnsi.joinCalls),
      0.95,
    ),
    rawAnsiJoinCacheHits: percentile(
      summaries.map(summary => summary.rawAnsi.joinCacheHits),
      0.95,
    ),
    rawAnsiJoinMaxMs: percentile(
      summaries.map(summary => summary.rawAnsi.joinMaxMs),
      0.95,
    ),
    rawAnsiMaxJoinedBytes: percentile(
      summaries.map(summary => summary.rawAnsi.maxJoinedBytes),
      0.95,
    ),
    optimizerInputPatches: percentile(
      summaries.map(summary => summary.optimizer.maxInputPatchCount),
      0.95,
    ),
    optimizerStdoutMerges: percentile(
      summaries.map(summary => summary.optimizer.stdoutMergeCount),
      0.95,
    ),
    optimizerNoopCursorDrops: percentile(
      summaries.map(summary => summary.optimizer.noopCursorMoveDropCount),
      0.95,
    ),
    optimizerCursorMoveMerges: percentile(
      summaries.map(summary => summary.optimizer.cursorMoveMergeCount),
      0.95,
    ),
    logUpdateVisibleCells: percentile(
      summaries.map(summary => summary.logUpdate.totalVisibleCells),
      0.95,
    ),
    logUpdateSkippedCells: percentile(
      summaries.map(summary => summary.logUpdate.totalSkippedCells),
      0.95,
    ),
    logUpdateMoveCursorCalls: percentile(
      summaries.map(summary => summary.logUpdate.totalMoveCursorCalls),
      0.95,
    ),
    logUpdateSameLineMoves: percentile(
      summaries.map(summary => summary.logUpdate.totalSameLineMoveCursorCalls),
      0.95,
    ),
    logUpdateGapFillCalls: percentile(
      summaries.map(summary => summary.logUpdate.totalBufferedGapFillCalls),
      0.95,
    ),
    logUpdateGapFillCells: percentile(
      summaries.map(summary => summary.logUpdate.totalBufferedGapFillCells),
      0.95,
    ),
    logUpdateIncrementalGapCandidateCalls: percentile(
      summaries.map(
        summary => summary.logUpdate.totalIncrementalGapFillCandidateCalls,
      ),
      0.95,
    ),
    logUpdateIncrementalGapCandidateCells: percentile(
      summaries.map(
        summary => summary.logUpdate.totalIncrementalGapFillCandidateCells,
      ),
      0.95,
    ),
    logUpdateIncrementalDiffMs: percentile(
      summaries.map(summary => summary.logUpdate.maxIncrementalDiffDurationMs),
      0.95,
    ),
    logUpdateIncrementalCallbackMs: percentile(
      summaries.map(
        summary => summary.logUpdate.maxIncrementalDiffCallbackDurationMs,
      ),
      0.95,
    ),
    logUpdateRowEndCrlfCount: percentile(
      summaries.map(summary => summary.logUpdate.totalRowEndCrlfCount),
      0.95,
    ),
    outputWriteOps: percentile(
      summaries.map(summary => summary.output.totalWriteOps),
      0.95,
    ),
    outputWriteCells: percentile(
      summaries.map(summary => summary.output.totalWriteCells),
      0.95,
    ),
    outputLineCacheMisses: percentile(
      summaries.map(summary => summary.output.lineCacheMisses),
      0.95,
    ),
    outputMaterializeMaxMs: percentile(
      summaries.map(summary => summary.output.maxMaterializeDurationMs),
      0.95,
    ),
    terminalWriteCalls: percentile(
      summaries.map(summary => summary.terminalWrite.writeCalls),
      0.95,
    ),
    terminalWriteMaxInputPatches: percentile(
      summaries.map(summary => summary.terminalWrite.maxInputPatchCount),
      0.95,
    ),
    terminalWriteMaxStdoutPatchBytes: percentile(
      summaries.map(summary => summary.terminalWrite.maxStdoutPatchBytes),
      0.95,
    ),
    terminalWriteSerializeMaxMs: percentile(
      summaries.map(summary => summary.terminalWrite.maxSerializeDurationMs),
      0.95,
    ),
  }
}

const summary = {
  reruns,
  coldMount: summarize(
    'markdown fenced-code cold mount',
    results.map(result => result.coldSummary),
  ),
  remount: summarize(
    'markdown fenced-code remount',
    results.map(result => result.remountSummary),
  ),
  runs: results,
}

const tmpRoot = process.env.TMPDIR ?? join(repoRoot, '.tmp')
mkdirSync(tmpRoot, { recursive: true })
const outDir = mkdtempSync(join(tmpRoot, 'markdown-perf-'))
const outPath = join(outDir, 'summary.json')
writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`)

console.log(`Summary written to ${outPath}`)
console.log(JSON.stringify(summary, null, 2))
