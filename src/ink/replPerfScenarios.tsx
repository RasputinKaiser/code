import { appendFileSync } from 'node:fs'
import {
  getRawAnsiRenderStatsSnapshot,
  resetRawAnsiRenderStatsForTesting,
} from './components/rawAnsiRenderStats.js'
import {
  getTerminalWriteStatsSnapshot,
  resetTerminalWriteStatsForTesting,
} from './terminalWriteStats.js'
import {
  getVirtualScrollStatsSnapshot,
  resetVirtualScrollStatsForTesting,
} from '../hooks/virtualScrollStats.js'
import {
  getOptimizerStatsSnapshot,
  resetOptimizerStatsForTesting,
} from './optimizerStats.js'
import {
  getLogUpdateRenderStatsSnapshot,
  resetLogUpdateRenderStatsForTesting,
} from './logUpdateRenderStats.js'
import {
  getOutputRenderStatsSnapshot,
  resetOutputRenderStatsForTesting,
} from './outputRenderStats.js'
import type { FrameEvent } from './frame.js'
import {
  cleanupMountedRepl,
  createDeferred,
  getMountedInkProbe,
  makeLargeTranscriptMessages,
  mountedScreenIncludes,
  mountRepl,
  readInkScreenCounter,
  readInkScreenLongHistoryFixtureIndex,
  readInkScreenMaxTranscriptIndex,
  readScreenText,
  waitFor,
  writeInput,
} from './replPerfHarness.js'

export type ReplPerfScenarioId =
  | 'prompt'
  | 'search'
  | 'assistant'
  | 'scroll'
  | 'long-history'

export const REPL_PERF_SCENARIO_IDS = [
  'prompt',
  'search',
  'assistant',
  'scroll',
  'long-history',
] as const satisfies readonly ReplPerfScenarioId[]

const PERF_SCENARIO_WAIT_TIMEOUT_MS = 8_000

export type PerfScenarioSummary = {
  scenario: string
  frames: number
  totalBytes: number
  maxBytes: number
  totalDurationMs: number
  maxDurationMs: number
  maxMeasured: number
  maxVisited: number
  totalPatches: number
  maxPatches: number
  flickerFrames: number
  rawAnsi: ReturnType<typeof getRawAnsiRenderStatsSnapshot>
  optimizer: ReturnType<typeof getOptimizerStatsSnapshot>
  logUpdate: ReturnType<typeof getLogUpdateRenderStatsSnapshot>
  output: ReturnType<typeof getOutputRenderStatsSnapshot>
  terminalWrite: ReturnType<typeof getTerminalWriteStatsSnapshot>
  virtualScroll: ReturnType<typeof getVirtualScrollStatsSnapshot>
}

type BaseScenarioResult = {
  label: string
  frames: FrameEvent[]
  output: string
  screenText: string
  summary: PerfScenarioSummary
}

export type PromptTypingScenarioResult = BaseScenarioResult & {
  draft: string
  correctedDraft: string
  totalBytes: number
  correctionFrames: FrameEvent[]
  correctionOutput: string
  correctionScreenText: string
  correctionTotalBytes: number
}

export type SearchOverlayScenarioResult = BaseScenarioResult & {
  counter: { current: number; total: number } | null
}

export type AssistantSpinnerScenarioResult = BaseScenarioResult & {
  beforeQueryCalls: number
}

export type LongScrollScenarioResult = BaseScenarioResult & {
  tailIndex: number | null
  scrolledIndex: number | null
  recoveredIndex: number | null
  scrollUpFrames: FrameEvent[]
  scrollUpOutput: string
  scrollDownFrames: FrameEvent[]
  scrollDownOutput: string
}

export type LongHistoryScenarioResult = BaseScenarioResult & {
  tailIndex: number | null
  scrolledIndex: number | null
  recoveredIndex: number | null
  transcriptEntryFrames: FrameEvent[]
  transcriptEntryOutput: string
  scrollFrames: FrameEvent[]
  scrollOutput: string
}

export const REPL_PERF_SCENARIO_TEST_NAMES: Record<ReplPerfScenarioId, string> = {
  search: 'streams search-overlay updates within frame/byte/Yoga budgets',
  assistant:
    'holds a real assistant-turn spinner overlay within frame/byte/Yoga budgets',
  prompt:
    'types in the prompt over a long transcript within bounded frame and Yoga budgets',
  scroll:
    'scrolls long transcripts within frame/byte/Yoga budgets without destructive clears',
  'long-history':
    'scrolls a file-heavy long transcript without freezing or exploding render work',
}

async function withReplPerfEnv<T>(fn: () => Promise<T>): Promise<T> {
  const prevNoFlicker = process.env.CLAUDE_CODE_NO_FLICKER
  const prevApiKey = process.env.ANTHROPIC_API_KEY
  process.env.CLAUDE_CODE_NO_FLICKER = '1'
  process.env.ANTHROPIC_API_KEY = 'test-key'

  try {
    return await fn()
  } finally {
    await cleanupMountedRepl()

    if (prevNoFlicker === undefined) {
      delete process.env.CLAUDE_CODE_NO_FLICKER
    } else {
      process.env.CLAUDE_CODE_NO_FLICKER = prevNoFlicker
    }

    if (prevApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = prevApiKey
    }
  }
}

function summarizeFrames(
  scenario: string,
  frames: FrameEvent[],
): PerfScenarioSummary {
  return {
    scenario,
    frames: frames.length,
    totalBytes: frames.reduce(
      (sum, frame) => sum + (frame.phases?.bytes ?? 0),
      0,
    ),
    maxBytes: Math.max(...frames.map(frame => frame.phases?.bytes ?? 0), 0),
    totalDurationMs: frames.reduce((sum, frame) => sum + frame.durationMs, 0),
    maxDurationMs: Math.max(...frames.map(frame => frame.durationMs), 0),
    maxMeasured: Math.max(
      ...frames.map(frame => frame.phases?.yogaMeasured ?? 0),
      0,
    ),
    maxVisited: Math.max(
      ...frames.map(frame => frame.phases?.yogaVisited ?? 0),
      0,
    ),
    totalPatches: frames.reduce(
      (sum, frame) => sum + (frame.phases?.patches ?? 0),
      0,
    ),
    maxPatches: Math.max(...frames.map(frame => frame.phases?.patches ?? 0), 0),
    flickerFrames: frames.reduce(
      (sum, frame) => sum + (frame.flickers.length > 0 ? 1 : 0),
      0,
    ),
    rawAnsi: getRawAnsiRenderStatsSnapshot(),
    optimizer: getOptimizerStatsSnapshot(),
    logUpdate: getLogUpdateRenderStatsSnapshot(),
    output: getOutputRenderStatsSnapshot(),
    terminalWrite: getTerminalWriteStatsSnapshot(),
    virtualScroll: getVirtualScrollStatsSnapshot(),
  }
}

function resetPerfHotPathStats(): void {
  resetRawAnsiRenderStatsForTesting()
  resetOptimizerStatsForTesting()
  resetLogUpdateRenderStatsForTesting()
  resetOutputRenderStatsForTesting()
  resetTerminalWriteStatsForTesting()
  resetVirtualScrollStatsForTesting()
}

export function appendPerfScenarioSummaryIfRequested(
  summary: PerfScenarioSummary,
): void {
  const perfLogPath = process.env.NCODE_REPL_PERF_LOG
  if (!perfLogPath) {
    return
  }
  appendFileSync(perfLogPath, `${JSON.stringify(summary)}\n`)
}

export async function runPromptTypingScenario(): Promise<PromptTypingScenarioResult> {
  return withReplPerfEnv(async () => {
    resetPerfHotPathStats()
    const draft = 'zzqxjv42'
    const correctedDraft = 'zzqxjw42'
    const { terminal, frames } = await mountRepl(220)
    const ink = getMountedInkProbe(terminal)
    if (!ink) {
      throw new Error('Mounted Ink probe was not available for prompt typing')
    }

    terminal.clearOutput()
    const typingStart = frames.length

    for (const char of draft) {
      await writeInput(terminal.stdin, char)
      await Bun.sleep(25)
    }

    await waitFor(
      () => mountedScreenIncludes(ink, draft),
      'typed draft never appeared in the mounted prompt screen',
    )
    await Bun.sleep(80)

    const typingFrames = frames.slice(typingStart)
    const output = terminal.getOutput()
    const screenText = readScreenText(ink.frontFrame.screen)
    const totalBytes = typingFrames.reduce(
      (sum, frame) => sum + (frame.phases?.bytes ?? 0),
      0,
    )

    terminal.clearOutput()
    const correctionStart = frames.length
    await writeInput(terminal.stdin, '\u001b[D')
    await Bun.sleep(25)
    await writeInput(terminal.stdin, '\u001b[D')
    await Bun.sleep(25)
    await writeInput(terminal.stdin, '\u007f')
    await Bun.sleep(25)
    await writeInput(terminal.stdin, 'w')
    await waitFor(
      () =>
        mountedScreenIncludes(ink, correctedDraft) &&
        !mountedScreenIncludes(ink, draft),
      'corrected prompt draft never replaced the original text',
      PERF_SCENARIO_WAIT_TIMEOUT_MS,
    )
    await Bun.sleep(80)

    const correctionFrames = frames.slice(correctionStart)
    const correctionOutput = terminal.getOutput()
    const correctionScreenText = readScreenText(ink.frontFrame.screen)
    const correctionTotalBytes = correctionFrames.reduce(
      (sum, frame) => sum + (frame.phases?.bytes ?? 0),
      0,
    )

    return {
      label: 'prompt typing over long transcript',
      draft,
      correctedDraft,
      frames: typingFrames,
      output,
      screenText,
      totalBytes,
      correctionFrames,
      correctionOutput,
      correctionScreenText,
      correctionTotalBytes,
      summary: summarizeFrames('prompt typing over long transcript', typingFrames),
    }
  })
}

export async function runStreamingSearchOverlayScenario(): Promise<SearchOverlayScenarioResult> {
  return withReplPerfEnv(async () => {
    resetPerfHotPathStats()
    const { terminal, frames } = await mountRepl()
    const ink = getMountedInkProbe(terminal)
    if (!ink) {
      throw new Error('Mounted Ink probe was not available for search overlay')
    }

    await writeInput(terminal.stdin, '\u000f')
    await waitFor(
      () => mountedScreenIncludes(ink, 'Showing detailed transcript'),
      'ctrl+o never entered transcript mode',
      PERF_SCENARIO_WAIT_TIMEOUT_MS,
    )

    terminal.clearOutput()
    const start = frames.length

    await writeInput(terminal.stdin, '/')
    await Bun.sleep(40)
    for (const char of 'assistant') {
      await writeInput(terminal.stdin, char)
      await Bun.sleep(25)
    }
    await writeInput(terminal.stdin, '\u007f')
    await Bun.sleep(40)
    await writeInput(terminal.stdin, 't')
    await Bun.sleep(80)
    await writeInput(terminal.stdin, '\r')
    await waitFor(
      () => readInkScreenCounter(ink) !== null,
      'streaming search overlay never rendered a mounted match counter',
      PERF_SCENARIO_WAIT_TIMEOUT_MS,
    )
    await Bun.sleep(120)

    const overlayFrames = frames.slice(start)
    return {
      label: 'streaming search overlay',
      frames: overlayFrames,
      output: terminal.getOutput(),
      screenText: readScreenText(ink.frontFrame.screen),
      counter: readInkScreenCounter(ink),
      summary: summarizeFrames('streaming search overlay', overlayFrames),
    }
  })
}

export async function runAssistantSpinnerScenario(): Promise<AssistantSpinnerScenarioResult> {
  return withReplPerfEnv(async () => {
    resetPerfHotPathStats()
    const turnEntered = createDeferred<void>()
    const releaseTurn = createDeferred<void>()
    let beforeQueryCalls = 0

    try {
      const { terminal, frames } = await mountRepl({
        replProps: {
          onBeforeQuery: async () => {
            beforeQueryCalls += 1
            if (beforeQueryCalls === 1) {
              turnEntered.resolve()
              await releaseTurn.promise
            }
            return false
          },
        },
      })
      const ink = getMountedInkProbe(terminal)
      if (!ink) {
        throw new Error(
          'Mounted Ink probe was not available for assistant spinner overlay',
        )
      }

      await writeInput(terminal.stdin, 'assistant overlay budget')
      await Bun.sleep(40)
      await writeInput(terminal.stdin, '\r')
      await waitFor(
        () => beforeQueryCalls === 1,
        'prompt submit never entered the assistant-turn loading path',
      )
      await turnEntered.promise
      await Bun.sleep(80)

      terminal.clearOutput()
      const overlayStart = frames.length

      await waitFor(
        () => frames.length > overlayStart,
        'held assistant turn never emitted a live overlay frame',
        1000,
      )
      await Bun.sleep(220)

      const overlayFrames = frames.slice(overlayStart)
      return {
        label: 'assistant-turn spinner overlay',
        frames: overlayFrames,
        output: terminal.getOutput(),
        screenText: readScreenText(ink.frontFrame.screen),
        beforeQueryCalls,
        summary: summarizeFrames(
          'assistant-turn spinner overlay',
          overlayFrames,
        ),
      }
    } finally {
      releaseTurn.resolve()
    }
  })
}

export async function runLongScrollScenario(): Promise<LongScrollScenarioResult> {
  return withReplPerfEnv(async () => {
    resetPerfHotPathStats()
    const messageCount = 220
    const { terminal, frames } = await mountRepl(messageCount)
    const ink = getMountedInkProbe(terminal)
    if (!ink) {
      throw new Error('Mounted Ink probe was not available for long scroll')
    }

    await writeInput(terminal.stdin, '\u000f')
    await waitFor(
      () => mountedScreenIncludes(ink, 'Showing detailed transcript'),
      'ctrl+o never entered transcript mode',
      PERF_SCENARIO_WAIT_TIMEOUT_MS,
    )

    await waitFor(
      () => readInkScreenMaxTranscriptIndex(ink) !== null,
      'mounted transcript never rendered message indexes',
      PERF_SCENARIO_WAIT_TIMEOUT_MS,
    )
    const tailIndex = readInkScreenMaxTranscriptIndex(ink)

    terminal.clearOutput()
    const scrollUpStart = frames.length
    for (let i = 0; i < 6; i += 1) {
      await writeInput(terminal.stdin, '\u0002')
      await Bun.sleep(40)
    }

    await waitFor(
      () => {
        const scrolled = readInkScreenMaxTranscriptIndex(ink)
        return (
          scrolled !== null &&
          tailIndex !== null &&
          scrolled <= tailIndex - 8
        )
      },
      'full-page transcript scroll-up never moved viewport to older rows',
      PERF_SCENARIO_WAIT_TIMEOUT_MS,
    )

    const scrollUpFrames = frames.slice(scrollUpStart)
    const scrollUpOutput = terminal.getOutput()
    const scrolledIndex = readInkScreenMaxTranscriptIndex(ink)

    terminal.clearOutput()
    const scrollDownStart = frames.length
    for (let i = 0; i < 6; i += 1) {
      await writeInput(terminal.stdin, '\u0006')
      await Bun.sleep(40)
    }

    await waitFor(
      () => {
        const recovered = readInkScreenMaxTranscriptIndex(ink)
        return (
          recovered !== null &&
          scrolledIndex !== null &&
          recovered > scrolledIndex
        )
      },
      'full-page transcript scroll-down never moved back toward transcript tail',
      PERF_SCENARIO_WAIT_TIMEOUT_MS,
    )

    const scrollDownFrames = frames.slice(scrollDownStart)
    const scrollDownOutput = terminal.getOutput()
    const recoveredIndex = readInkScreenMaxTranscriptIndex(ink)
    const allFrames = [...scrollUpFrames, ...scrollDownFrames]

    return {
      label: 'long transcript full-page scroll',
      frames: allFrames,
      output: `${scrollUpOutput}\n${scrollDownOutput}`,
      screenText: readScreenText(ink.frontFrame.screen),
      tailIndex,
      scrolledIndex,
      recoveredIndex,
      scrollUpFrames,
      scrollUpOutput,
      scrollDownFrames,
      scrollDownOutput,
      summary: summarizeFrames('long transcript full-page scroll', allFrames),
    }
  })
}

export async function runLongHistoryScenario(): Promise<LongHistoryScenarioResult> {
  return withReplPerfEnv(async () => {
    resetPerfHotPathStats()
    // This is intentionally heavier than the oracle-backed lanes above.
    // The pathological failures we care about show up when long transcripts
    // also render large file/code blocks, not when the REPL only mounts a few
    // hundred short single-line messages.
    const { terminal, frames } = await mountRepl({
      replProps: {
        initialMessages: makeLargeTranscriptMessages(),
      },
    })
    const ink = getMountedInkProbe(terminal)
    if (!ink) {
      throw new Error(
        'Mounted Ink probe was not available for long-history stress scenario',
      )
    }

    terminal.clearOutput()
    const transcriptEntryStart = frames.length

    await writeInput(terminal.stdin, '\u000f')
    await waitFor(
      () => mountedScreenIncludes(ink, 'Showing detailed transcript'),
      'ctrl+o never entered transcript mode for the long-history stress scenario',
      8000,
    )

    await waitFor(
      () => readInkScreenLongHistoryFixtureIndex(ink) !== null,
      'long-history transcript never rendered fixture summary indexes',
      8000,
    )
    await Bun.sleep(120)

    const transcriptEntryFrames = frames.slice(transcriptEntryStart)
    const transcriptEntryOutput = terminal.getOutput()
    const tailIndex = readInkScreenLongHistoryFixtureIndex(ink)

    terminal.clearOutput()
    const scrollStart = frames.length

    for (let i = 0; i < 20; i += 1) {
      await writeInput(terminal.stdin, '\u0002')
      await Bun.sleep(60)
    }

    await waitFor(
      () => {
        const scrolledFixture = readInkScreenLongHistoryFixtureIndex(ink)
        return (
          scrolledFixture !== null &&
          tailIndex !== null &&
          scrolledFixture < tailIndex
        )
      },
      'long-history scroll-up never moved viewport to older rows',
      8000,
    )
    const scrolledIndex = readInkScreenLongHistoryFixtureIndex(ink)

    for (let i = 0; i < 20; i += 1) {
      await writeInput(terminal.stdin, '\u0006')
      await Bun.sleep(60)
    }

    await waitFor(
      () => {
        const recoveredFixture = readInkScreenLongHistoryFixtureIndex(ink)
        return (
          recoveredFixture !== null &&
          tailIndex !== null &&
          recoveredFixture >= tailIndex
        )
      },
      'long-history scroll-down never returned to transcript tail',
      8000,
    )

    await Bun.sleep(120)

    const scrollFrames = frames.slice(scrollStart)
    const scrollOutput = terminal.getOutput()
    const recoveredIndex = readInkScreenLongHistoryFixtureIndex(ink)
    const allFrames = [...transcriptEntryFrames, ...scrollFrames]

    return {
      label: 'file-heavy long-history transcript entry and scroll',
      frames: allFrames,
      output: `${transcriptEntryOutput}\n${scrollOutput}`,
      screenText: readScreenText(ink.frontFrame.screen),
      tailIndex,
      scrolledIndex,
      recoveredIndex,
      transcriptEntryFrames,
      transcriptEntryOutput,
      scrollFrames,
      scrollOutput,
      summary: summarizeFrames(
        'file-heavy long-history transcript entry and scroll',
        allFrames,
      ),
    }
  })
}

export async function runReplPerfScenario(
  id: ReplPerfScenarioId,
): Promise<
  | PromptTypingScenarioResult
  | SearchOverlayScenarioResult
  | AssistantSpinnerScenarioResult
  | LongScrollScenarioResult
  | LongHistoryScenarioResult
> {
  switch (id) {
    case 'prompt':
      return runPromptTypingScenario()
    case 'search':
      return runStreamingSearchOverlayScenario()
    case 'assistant':
      return runAssistantSpinnerScenario()
    case 'scroll':
      return runLongScrollScenario()
    case 'long-history':
      return runLongHistoryScenario()
  }
}
