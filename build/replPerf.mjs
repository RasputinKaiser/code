import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const buildDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(buildDir, '..')
const oracleFile = path.join(rootDir, 'src', 'ink', 'replFlickerOracle.test.tsx')
const scenarioRunnerFile = path.join(
  rootDir,
  'src',
  'ink',
  'replPerfProfile.tsx',
)
const defaultTmpDir = path.join(rootDir, '.tmp')

const scenarioTable = {
  all: {
    label: 'all',
    tests: [
      'streams search-overlay updates within frame/byte/Yoga budgets',
      'holds a real assistant-turn spinner overlay within frame/byte/Yoga budgets',
      'types in the prompt over a long transcript within bounded frame and Yoga budgets',
      'scrolls long transcripts within frame/byte/Yoga budgets without destructive clears',
    ],
  },
  search: {
    label: 'search',
    tests: ['streams search-overlay updates within frame/byte/Yoga budgets'],
  },
  assistant: {
    label: 'assistant',
    tests: ['holds a real assistant-turn spinner overlay within frame/byte/Yoga budgets'],
  },
  prompt: {
    label: 'prompt',
    tests: ['types in the prompt over a long transcript within bounded frame and Yoga budgets'],
  },
  scroll: {
    label: 'scroll',
    tests: ['scrolls long transcripts within frame/byte/Yoga budgets without destructive clears'],
  },
  'long-history': {
    label: 'long-history',
    runnerScenario: 'long-history',
  },
}

/**
 * @typedef {{
 *   scenario: string
 *   frames: number
 *   totalBytes: number
 *   maxBytes: number
 *   totalDurationMs: number
 *   maxDurationMs: number
 *   maxMeasured: number
 *   maxVisited: number
 *   totalPatches: number
 *   maxPatches: number
 *   flickerFrames: number
 * }} PerfScenarioSummary
 */

function usage() {
  console.log(`Usage: bun build/replPerf.mjs [all|prompt|search|assistant|scroll|long-history] [--reruns N] [--cleanup]

Examples:
  bun build/replPerf.mjs prompt
  bun build/replPerf.mjs all --reruns 7
  bun build/replPerf.mjs scroll --cleanup`)
}

function parseArgs(argv) {
  let scenarioKey = 'all'
  let reruns = 5
  let cleanupArtifacts = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      usage()
      process.exit(0)
    }
    if (arg === '--reruns') {
      const next = argv[i + 1]
      if (!next) {
        throw new Error('--reruns requires a value')
      }
      reruns = Number.parseInt(next, 10)
      i += 1
      continue
    }
    if (arg === '--cleanup') {
      cleanupArtifacts = true
      continue
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}`)
    }
    scenarioKey = arg
  }

  if (!Number.isInteger(reruns) || reruns <= 0) {
    throw new Error(`--reruns must be a positive integer, got: ${reruns}`)
  }

  const scenario = scenarioTable[scenarioKey]
  if (!scenario) {
    throw new Error(`Unknown scenario: ${scenarioKey}`)
  }

  return { scenarioKey, scenario, reruns, cleanupArtifacts }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function quantile(values, q) {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * q) - 1),
  )
  return sorted[index]
}

function mean(values) {
  if (values.length === 0) {
    return 0
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function summarizeSamples(label, samples) {
  const byMetric = metric => samples.map(sample => sample[metric] ?? 0)
  const byRawAnsi = metric =>
    samples.map(sample => sample.rawAnsi?.[metric] ?? 0)
  const byOptimizer = metric =>
    samples.map(sample => sample.optimizer?.[metric] ?? 0)
  const byLogUpdate = metric =>
    samples.map(sample => sample.logUpdate?.[metric] ?? 0)
  const byOutput = metric =>
    samples.map(sample => sample.output?.[metric] ?? 0)
  const byTerminalWrite = metric =>
    samples.map(sample => sample.terminalWrite?.[metric] ?? 0)
  const byVirtualScroll = metric =>
    samples.map(sample => sample.virtualScroll?.[metric] ?? 0)
  return {
    scenario: label,
    samples: samples.length,
    frames_mean: mean(byMetric('frames')),
    frames_p95: quantile(byMetric('frames'), 0.95),
    max_bytes_mean: mean(byMetric('maxBytes')),
    max_bytes_p95: quantile(byMetric('maxBytes'), 0.95),
    total_bytes_mean: mean(byMetric('totalBytes')),
    total_bytes_p95: quantile(byMetric('totalBytes'), 0.95),
    max_duration_ms_mean: mean(byMetric('maxDurationMs')),
    max_duration_ms_p95: quantile(byMetric('maxDurationMs'), 0.95),
    max_measured_p95: quantile(byMetric('maxMeasured'), 0.95),
    max_visited_p95: quantile(byMetric('maxVisited'), 0.95),
    max_patches_p95: quantile(byMetric('maxPatches'), 0.95),
    raw_ansi_join_calls_p95: quantile(byRawAnsi('joinCalls'), 0.95),
    raw_ansi_join_cache_hits_p95: quantile(
      byRawAnsi('joinCacheHits'),
      0.95,
    ),
    raw_ansi_max_joined_bytes_p95: quantile(
      byRawAnsi('maxJoinedBytes'),
      0.95,
    ),
    optimizer_input_patches_p95: quantile(
      byOptimizer('maxInputPatchCount'),
      0.95,
    ),
    optimizer_stdout_merges_p95: quantile(
      byOptimizer('stdoutMergeCount'),
      0.95,
    ),
    optimizer_noop_cursor_drops_p95: quantile(
      byOptimizer('noopCursorMoveDropCount'),
      0.95,
    ),
    optimizer_cursor_move_merges_p95: quantile(
      byOptimizer('cursorMoveMergeCount'),
      0.95,
    ),
    log_update_visible_cells_p95: quantile(
      byLogUpdate('totalVisibleCells'),
      0.95,
    ),
    log_update_skipped_cells_p95: quantile(
      byLogUpdate('totalSkippedCells'),
      0.95,
    ),
    log_update_move_cursor_calls_p95: quantile(
      byLogUpdate('totalMoveCursorCalls'),
      0.95,
    ),
    log_update_same_line_moves_p95: quantile(
      byLogUpdate('totalSameLineMoveCursorCalls'),
      0.95,
    ),
    log_update_line_change_next_row_home_p95: quantile(
      byLogUpdate('totalLineChangeNextRowHomeCalls'),
      0.95,
    ),
    log_update_line_change_next_row_offset_p95: quantile(
      byLogUpdate('totalLineChangeNextRowOffsetCalls'),
      0.95,
    ),
    log_update_line_change_multi_row_home_p95: quantile(
      byLogUpdate('totalLineChangeMultiRowHomeCalls'),
      0.95,
    ),
    log_update_line_change_multi_row_offset_p95: quantile(
      byLogUpdate('totalLineChangeMultiRowOffsetCalls'),
      0.95,
    ),
    log_update_gap_fill_calls_p95: quantile(
      byLogUpdate('totalBufferedGapFillCalls'),
      0.95,
    ),
    log_update_gap_fill_cells_p95: quantile(
      byLogUpdate('totalBufferedGapFillCells'),
      0.95,
    ),
    log_update_next_row_prefix_fill_calls_p95: quantile(
      byLogUpdate('totalBufferedNextRowPrefixFillCalls'),
      0.95,
    ),
    log_update_next_row_prefix_fill_cells_p95: quantile(
      byLogUpdate('totalBufferedNextRowPrefixFillCells'),
      0.95,
    ),
    log_update_next_row_prefix_analysis_calls_p95: quantile(
      byLogUpdate('totalNextRowPrefixAnalysisCalls'),
      0.95,
    ),
    log_update_next_row_prefix_partial_calls_p95: quantile(
      byLogUpdate('totalNextRowPrefixPartialGapFillCandidateCalls'),
      0.95,
    ),
    log_update_next_row_prefix_partial_cells_p95: quantile(
      byLogUpdate('totalNextRowPrefixPartialGapFillCandidateCells'),
      0.95,
    ),
    log_update_next_row_prefix_partial_remaining_calls_p95: quantile(
      byLogUpdate('totalNextRowPrefixPartialRemainingDistanceCalls'),
      0.95,
    ),
    log_update_next_row_prefix_partial_remaining_cells_p95: quantile(
      byLogUpdate('totalNextRowPrefixPartialRemainingDistanceCells'),
      0.95,
    ),
    log_update_next_row_prefix_partial_remaining_max_cells_p95: quantile(
      byLogUpdate('maxNextRowPrefixPartialRemainingDistanceCells'),
      0.95,
    ),
    log_update_next_row_prefix_blocked_by_active_hyperlink_p95: quantile(
      byLogUpdate('totalNextRowPrefixBlockedByActiveHyperlink'),
      0.95,
    ),
    log_update_next_row_prefix_blocked_by_content_end_p95: quantile(
      byLogUpdate('totalNextRowPrefixBlockedByContentEnd'),
      0.95,
    ),
    log_update_next_row_prefix_blocked_by_non_space_char_p95: quantile(
      byLogUpdate('totalNextRowPrefixBlockedByNonSpaceChar'),
      0.95,
    ),
    log_update_next_row_prefix_blocked_by_space_metadata_p95: quantile(
      byLogUpdate('totalNextRowPrefixBlockedBySpaceMetadata'),
      0.95,
    ),
    log_update_next_row_prefix_blocked_by_default_style_mismatch_p95: quantile(
      byLogUpdate('totalNextRowPrefixBlockedByDefaultStyleMismatch'),
      0.95,
    ),
    log_update_next_row_prefix_blocked_by_fg_style_mismatch_p95: quantile(
      byLogUpdate('totalNextRowPrefixBlockedByFgStyleMismatch'),
      0.95,
    ),
    log_update_next_row_content_end_zero_p95: quantile(
      byLogUpdate('totalNextRowContentEndZeroCalls'),
      0.95,
    ),
    log_update_next_row_content_end_zero_pending_wrap_p95: quantile(
      byLogUpdate('totalNextRowContentEndZeroPendingWrapCalls'),
      0.95,
    ),
    log_update_next_row_content_end_zero_removed_only_p95: quantile(
      byLogUpdate('totalNextRowContentEndZeroRemovedOnlyCalls'),
      0.95,
    ),
    log_update_next_row_content_end_zero_added_only_p95: quantile(
      byLogUpdate('totalNextRowContentEndZeroAddedOnlyCalls'),
      0.95,
    ),
    log_update_next_row_content_end_zero_removed_and_added_p95: quantile(
      byLogUpdate('totalNextRowContentEndZeroRemovedAndAddedCalls'),
      0.95,
    ),
    log_update_next_row_content_end_zero_empty_target_p95: quantile(
      byLogUpdate('totalNextRowContentEndZeroEmptyTargetCalls'),
      0.95,
    ),
    log_update_next_row_content_end_zero_non_empty_target_p95: quantile(
      byLogUpdate('totalNextRowContentEndZeroNonEmptyTargetCalls'),
      0.95,
    ),
    log_update_next_row_content_end_zero_non_empty_visible_char_p95: quantile(
      byLogUpdate('totalNextRowContentEndZeroNonEmptyTargetVisibleCharCalls'),
      0.95,
    ),
    log_update_next_row_content_end_zero_non_empty_styled_space_p95: quantile(
      byLogUpdate('totalNextRowContentEndZeroNonEmptyTargetStyledSpaceCalls'),
      0.95,
    ),
    log_update_next_row_content_end_zero_non_empty_spacer_p95: quantile(
      byLogUpdate('totalNextRowContentEndZeroNonEmptyTargetSpacerCalls'),
      0.95,
    ),
    log_update_next_row_content_end_positive_p95: quantile(
      byLogUpdate('totalNextRowContentEndPositiveCalls'),
      0.95,
    ),
    log_update_tail_clear_shortcuts_p95: quantile(
      byLogUpdate('totalIncrementalTailClearShortcutCalls'),
      0.95,
    ),
    log_update_incremental_gap_candidate_calls_p95: quantile(
      byLogUpdate('totalIncrementalGapFillCandidateCalls'),
      0.95,
    ),
    log_update_incremental_gap_candidate_cells_p95: quantile(
      byLogUpdate('totalIncrementalGapFillCandidateCells'),
      0.95,
    ),
    log_update_partial_gap_fill_calls_p95: quantile(
      byLogUpdate('totalPartialGapFillCandidateCalls'),
      0.95,
    ),
    log_update_partial_gap_fill_cells_p95: quantile(
      byLogUpdate('totalPartialGapFillCandidateCells'),
      0.95,
    ),
    log_update_gap_blocked_by_active_hyperlink_p95: quantile(
      byLogUpdate('totalGapBlockedByActiveHyperlink'),
      0.95,
    ),
    log_update_gap_blocked_by_content_end_p95: quantile(
      byLogUpdate('totalGapBlockedByContentEnd'),
      0.95,
    ),
    log_update_gap_blocked_by_non_space_char_p95: quantile(
      byLogUpdate('totalGapBlockedByNonSpaceChar'),
      0.95,
    ),
    log_update_gap_blocked_by_space_metadata_p95: quantile(
      byLogUpdate('totalGapBlockedBySpaceMetadata'),
      0.95,
    ),
    log_update_gap_blocked_by_default_style_mismatch_p95: quantile(
      byLogUpdate('totalGapBlockedByDefaultStyleMismatch'),
      0.95,
    ),
    log_update_gap_blocked_by_fg_style_mismatch_p95: quantile(
      byLogUpdate('totalGapBlockedByFgStyleMismatch'),
      0.95,
    ),
    log_update_incremental_diff_ms_p95: quantile(
      byLogUpdate('maxIncrementalDiffDurationMs'),
      0.95,
    ),
    log_update_incremental_callback_ms_p95: quantile(
      byLogUpdate('maxIncrementalDiffCallbackDurationMs'),
      0.95,
    ),
    output_write_ops_p95: quantile(byOutput('totalWriteOps'), 0.95),
    output_write_cells_p95: quantile(byOutput('totalWriteCells'), 0.95),
    output_line_cache_misses_p95: quantile(byOutput('lineCacheMisses'), 0.95),
    output_materialize_ms_p95: quantile(
      byOutput('maxMaterializeDurationMs'),
      0.95,
    ),
    terminal_post_opt_patches_p95: quantile(
      byTerminalWrite('maxInputPatchCount'),
      0.95,
    ),
    terminal_stdout_patch_bytes_p95: quantile(
      byTerminalWrite('maxStdoutPatchBytes'),
      0.95,
    ),
    terminal_serialize_ms_p95: quantile(
      byTerminalWrite('maxSerializeDurationMs'),
      0.95,
    ),
    virtual_scroll_samples_p95: quantile(byVirtualScroll('samples'), 0.95),
    virtual_scroll_item_count_p95: quantile(
      byVirtualScroll('maxItemCount'),
      0.95,
    ),
    virtual_scroll_mounted_count_p95: quantile(
      byVirtualScroll('maxMountedCount'),
      0.95,
    ),
    virtual_scroll_unmeasured_mounted_p95: quantile(
      byVirtualScroll('maxUnmeasuredMountedCount'),
      0.95,
    ),
    virtual_scroll_height_cache_p95: quantile(
      byVirtualScroll('maxHeightCacheSize'),
      0.95,
    ),
    virtual_scroll_ref_count_p95: quantile(
      byVirtualScroll('maxMountedRefCount'),
      0.95,
    ),
  }
}

function printScenarioSummary(summary) {
  console.log(`\n${summary.scenario} (${summary.samples} samples)`)
  console.log(
    `  frames mean/p95: ${formatNumber(summary.frames_mean)} / ${formatNumber(summary.frames_p95)}`,
  )
  console.log(
    `  max bytes mean/p95: ${formatNumber(summary.max_bytes_mean)} / ${formatNumber(summary.max_bytes_p95)}`,
  )
  console.log(
    `  total bytes mean/p95: ${formatNumber(summary.total_bytes_mean)} / ${formatNumber(summary.total_bytes_p95)}`,
  )
  console.log(
    `  max frame ms mean/p95: ${formatNumber(summary.max_duration_ms_mean)} / ${formatNumber(summary.max_duration_ms_p95)}`,
  )
  console.log(
    `  Yoga measured p95: ${formatNumber(summary.max_measured_p95)} | Yoga visited p95: ${formatNumber(summary.max_visited_p95)}`,
  )
  console.log(
    `  patch count p95: ${formatNumber(summary.max_patches_p95)}`,
  )
  console.log(
    `  RawAnsi join calls/cache-hit p95: ${formatNumber(summary.raw_ansi_join_calls_p95)} / ${formatNumber(summary.raw_ansi_join_cache_hits_p95)}`,
  )
  console.log(
    `  RawAnsi max joined bytes p95: ${formatNumber(summary.raw_ansi_max_joined_bytes_p95)}`,
  )
  console.log(
    `  optimizer input patches/stdout merges/noop cursor drops/cursor merges p95: ${formatNumber(summary.optimizer_input_patches_p95)} / ${formatNumber(summary.optimizer_stdout_merges_p95)} / ${formatNumber(summary.optimizer_noop_cursor_drops_p95)} / ${formatNumber(summary.optimizer_cursor_move_merges_p95)}`,
  )
  console.log(
    `  log-update visible/skipped/move/same-line p95: ${formatNumber(summary.log_update_visible_cells_p95)} / ${formatNumber(summary.log_update_skipped_cells_p95)} / ${formatNumber(summary.log_update_move_cursor_calls_p95)} / ${formatNumber(summary.log_update_same_line_moves_p95)}`,
  )
  console.log(
    `  log-update line-change next-row-home/offset multi-row-home/offset p95: ${formatNumber(summary.log_update_line_change_next_row_home_p95)} / ${formatNumber(summary.log_update_line_change_next_row_offset_p95)} / ${formatNumber(summary.log_update_line_change_multi_row_home_p95)} / ${formatNumber(summary.log_update_line_change_multi_row_offset_p95)}`,
  )
  console.log(
    `  log-update gap-fill calls/cells p95: ${formatNumber(summary.log_update_gap_fill_calls_p95)} / ${formatNumber(summary.log_update_gap_fill_cells_p95)}`,
  )
  console.log(
    `  log-update next-row prefix-fill calls/cells p95: ${formatNumber(summary.log_update_next_row_prefix_fill_calls_p95)} / ${formatNumber(summary.log_update_next_row_prefix_fill_cells_p95)}`,
  )
  console.log(
    `  log-update next-row prefix analysis calls/partial calls/partial cells p95: ${formatNumber(summary.log_update_next_row_prefix_analysis_calls_p95)} / ${formatNumber(summary.log_update_next_row_prefix_partial_calls_p95)} / ${formatNumber(summary.log_update_next_row_prefix_partial_cells_p95)}`,
  )
  console.log(
    `  log-update next-row prefix partial remaining calls/cells/max-cells p95: ${formatNumber(summary.log_update_next_row_prefix_partial_remaining_calls_p95)} / ${formatNumber(summary.log_update_next_row_prefix_partial_remaining_cells_p95)} / ${formatNumber(summary.log_update_next_row_prefix_partial_remaining_max_cells_p95)}`,
  )
  console.log(
    `  log-update next-row prefix blockers active/content/non-space/meta/default-style/fg-style p95: ${formatNumber(summary.log_update_next_row_prefix_blocked_by_active_hyperlink_p95)} / ${formatNumber(summary.log_update_next_row_prefix_blocked_by_content_end_p95)} / ${formatNumber(summary.log_update_next_row_prefix_blocked_by_non_space_char_p95)} / ${formatNumber(summary.log_update_next_row_prefix_blocked_by_space_metadata_p95)} / ${formatNumber(summary.log_update_next_row_prefix_blocked_by_default_style_mismatch_p95)} / ${formatNumber(summary.log_update_next_row_prefix_blocked_by_fg_style_mismatch_p95)}`,
  )
  console.log(
    `  log-update next-row content-end zero/pending-wrap/removed-only/added-only/removed+added/positive p95: ${formatNumber(summary.log_update_next_row_content_end_zero_p95)} / ${formatNumber(summary.log_update_next_row_content_end_zero_pending_wrap_p95)} / ${formatNumber(summary.log_update_next_row_content_end_zero_removed_only_p95)} / ${formatNumber(summary.log_update_next_row_content_end_zero_added_only_p95)} / ${formatNumber(summary.log_update_next_row_content_end_zero_removed_and_added_p95)} / ${formatNumber(summary.log_update_next_row_content_end_positive_p95)}`,
  )
  console.log(
    `  log-update next-row content-end zero empty-target/non-empty-target p95: ${formatNumber(summary.log_update_next_row_content_end_zero_empty_target_p95)} / ${formatNumber(summary.log_update_next_row_content_end_zero_non_empty_target_p95)}`,
  )
  console.log(
    `  log-update next-row content-end zero non-empty target visible/styled-space/spacer p95: ${formatNumber(summary.log_update_next_row_content_end_zero_non_empty_visible_char_p95)} / ${formatNumber(summary.log_update_next_row_content_end_zero_non_empty_styled_space_p95)} / ${formatNumber(summary.log_update_next_row_content_end_zero_non_empty_spacer_p95)}`,
  )
  console.log(
    `  log-update tail-clear shortcuts p95: ${formatNumber(summary.log_update_tail_clear_shortcuts_p95)}`,
  )
  console.log(
    `  log-update partial gap-fill calls/cells p95: ${formatNumber(summary.log_update_partial_gap_fill_calls_p95)} / ${formatNumber(summary.log_update_partial_gap_fill_cells_p95)}`,
  )
  console.log(
    `  log-update gap blockers active/content/non-space/meta/default-style/fg-style p95: ${formatNumber(summary.log_update_gap_blocked_by_active_hyperlink_p95)} / ${formatNumber(summary.log_update_gap_blocked_by_content_end_p95)} / ${formatNumber(summary.log_update_gap_blocked_by_non_space_char_p95)} / ${formatNumber(summary.log_update_gap_blocked_by_space_metadata_p95)} / ${formatNumber(summary.log_update_gap_blocked_by_default_style_mismatch_p95)} / ${formatNumber(summary.log_update_gap_blocked_by_fg_style_mismatch_p95)}`,
  )
  console.log(
    `  log-update incremental gap-candidates calls/cells p95: ${formatNumber(summary.log_update_incremental_gap_candidate_calls_p95)} / ${formatNumber(summary.log_update_incremental_gap_candidate_cells_p95)}`,
  )
  console.log(
    `  log-update inc-diff/inc-callback ms p95: ${formatNumber(summary.log_update_incremental_diff_ms_p95)} / ${formatNumber(summary.log_update_incremental_callback_ms_p95)}`,
  )
  console.log(
    `  output write ops/cells/cache-misses/materialize-ms p95: ${formatNumber(summary.output_write_ops_p95)} / ${formatNumber(summary.output_write_cells_p95)} / ${formatNumber(summary.output_line_cache_misses_p95)} / ${formatNumber(summary.output_materialize_ms_p95)}`,
  )
  console.log(
    `  terminal post-opt patches p95: ${formatNumber(summary.terminal_post_opt_patches_p95)} | stdout patch bytes p95: ${formatNumber(summary.terminal_stdout_patch_bytes_p95)} | serialize ms p95: ${formatNumber(summary.terminal_serialize_ms_p95)}`,
  )
  console.log(
    `  virtual-scroll samples/items/mounted/unmeasured/cache/refs p95: ${formatNumber(summary.virtual_scroll_samples_p95)} / ${formatNumber(summary.virtual_scroll_item_count_p95)} / ${formatNumber(summary.virtual_scroll_mounted_count_p95)} / ${formatNumber(summary.virtual_scroll_unmeasured_mounted_p95)} / ${formatNumber(summary.virtual_scroll_height_cache_p95)} / ${formatNumber(summary.virtual_scroll_ref_count_p95)}`,
  )
}

async function readSummaries(logPath) {
  const raw = await readFile(logPath, 'utf8')
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line))
}

async function runScenario({
  scenarioName,
  reruns,
  artifactDir,
  tmpDir,
  runnerScenario,
}) {
  if (runnerScenario) {
    const samples = []
    for (let i = 0; i < reruns; i += 1) {
      const summaryPath = path.join(
        artifactDir,
        `${runnerScenario.replaceAll(/[^a-z0-9]+/gi, '_').toLowerCase()}-${i + 1}.json`,
      )
      const cmd = [process.execPath, scenarioRunnerFile, runnerScenario]

      console.log(`\nRunning ${scenarioName} (sample ${i + 1}/${reruns})`)
      console.log(`  ${cmd.join(' ')}`)

      const proc = Bun.spawn({
        cmd,
        cwd: rootDir,
        stdout: 'inherit',
        stderr: 'inherit',
        env: {
          ...process.env,
          TMPDIR: process.env.TMPDIR ?? tmpDir,
          NCODE_REPL_PROFILE_SUMMARY: summaryPath,
        },
      })

      const exitCode = await proc.exited
      if (exitCode !== 0) {
        throw new Error(`${scenarioName} failed with exit code ${exitCode}`)
      }

      const summary = JSON.parse(await readFile(summaryPath, 'utf8'))
      samples.push(summary.summary)
    }
    return samples
  }

  const logPath = path.join(
    artifactDir,
    `${scenarioName.replaceAll(/[^a-z0-9]+/gi, '_').toLowerCase()}.jsonl`,
  )
  const cmd = [process.execPath]
  cmd.push(
    'test',
    oracleFile,
    '--test-name-pattern',
    escapeRegExp(scenarioName),
    '--rerun-each',
    String(reruns),
  )

  console.log(`\nRunning ${scenarioName}`)
  console.log(`  ${cmd.join(' ')}`)

  const proc = Bun.spawn({
    cmd,
    cwd: rootDir,
    stdout: 'inherit',
    stderr: 'inherit',
    env: {
      ...process.env,
      TMPDIR: process.env.TMPDIR ?? tmpDir,
      NCODE_REPL_PERF_LOG: logPath,
    },
  })

  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`${scenarioName} failed with exit code ${exitCode}`)
  }

  return readSummaries(logPath)
}

const { scenario, reruns, cleanupArtifacts } = parseArgs(
  process.argv.slice(2),
)

await mkdir(defaultTmpDir, { recursive: true })
const artifactDir = await mkdtemp(path.join(defaultTmpDir, 'repl-perf-'))
const tmpDir = path.join(artifactDir, 'tmp')
await mkdir(tmpDir, { recursive: true })

try {
  /** @type {Record<string, PerfScenarioSummary[]>} */
  const scenarioResults = {}

  if (scenario.tests) {
    for (const scenarioName of scenario.tests) {
      scenarioResults[scenarioName] = await runScenario({
        scenarioName,
        reruns,
        artifactDir,
        tmpDir,
      })
    }
  } else if (scenario.runnerScenario) {
    scenarioResults[scenario.label] = await runScenario({
      scenarioName: scenario.label,
      reruns,
      artifactDir,
      tmpDir,
      runnerScenario: scenario.runnerScenario,
    })
  }

  const aggregate = Object.entries(scenarioResults).map(([label, samples]) =>
    summarizeSamples(label, samples),
  )

  const summaryPath = path.join(artifactDir, 'summary.json')
  await writeFile(summaryPath, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8')

  console.log('\nREPL perf summary')
  console.log(`  artifacts: ${artifactDir}`)
  console.log(`  summary:   ${summaryPath}`)
  for (const scenarioSummary of aggregate) {
    printScenarioSummary(scenarioSummary)
  }
} finally {
  if (cleanupArtifacts) {
    await rm(artifactDir, { recursive: true, force: true })
  } else {
    console.log(`\nKeeping perf artifacts at ${artifactDir}`)
  }
}
