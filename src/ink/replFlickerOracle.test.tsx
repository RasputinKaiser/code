import { afterEach, describe, expect, it } from 'bun:test'
import type { FrameEvent } from './frame.js'
import {
  cleanupMountedRepl,
  collapseWhitespace,
  getMountedInkProbe,
  mountedScreenIncludes,
  mountRepl,
  readInkScreenCounter,
  readInkScreenMaxTranscriptIndex,
  readScreenText,
  stripTerminalOutput,
  waitFor,
  writeInput,
} from './replPerfHarness.js'
import {
  assertInteractionContract,
  expectPromptFooterModules,
  parseMatchCounter,
  type InteractionFrameMetrics,
} from '../testing/replContractHarness.js'
import {
  findPromptRow,
  readTranscriptBandAbovePrompt,
} from '../testing/replScreenContractHarness.js'
import {
  appendPerfScenarioSummaryIfRequested,
  runAssistantSpinnerScenario,
  runLongHistoryScenario,
  runLongScrollScenario,
  runPromptTypingScenario,
  runStreamingSearchOverlayScenario,
} from './replPerfScenarios.js'

const TEST_CWD_SEGMENT = process.cwd()
const ORACLE_TEST_TIMEOUT_MS = 20_000
const TRANSCRIPT_SETTLE_TIMEOUT_MS = 8_000

function sgrMouse(
  button: number,
  col: number,
  row: number,
  action: 'press' | 'release',
): string {
  return `\u001b[<${button};${col};${row}${action === 'press' ? 'M' : 'm'}`
}

afterEach(async () => {
  await cleanupMountedRepl()
})

async function withMountedReplEnv<T>(fn: () => Promise<T>): Promise<T> {
  const prevNoFlicker = process.env.CLAUDE_CODE_NO_FLICKER
  const prevApiKey = process.env.ANTHROPIC_API_KEY
  process.env.CLAUDE_CODE_NO_FLICKER = '1'
  process.env.ANTHROPIC_API_KEY = 'test-key'

  try {
    return await fn()
  } finally {
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

function readFrameMetrics(frame: FrameEvent): InteractionFrameMetrics {
  return {
    bytes: frame.phases?.bytes ?? 0,
    yogaMeasured: frame.phases?.yogaMeasured ?? 0,
    yogaVisited: frame.phases?.yogaVisited ?? 0,
    flickers: frame.flickers.length,
  }
}

function expectVirtualScrollBudget(
  label: string,
  summary: {
    virtualScroll?: {
      maxMountedCount?: number
      maxUnmeasuredMountedCount?: number
    }
  },
  budget: {
    maxMounted: number
    maxUnmeasured: number
  },
): void {
  const stats = summary.virtualScroll
  expect(stats, `${label} did not record virtual-scroll stats`).toBeDefined()
  expect(
    stats?.maxMountedCount ?? 0,
    `${label} mounted too many rows`,
  ).toBeLessThanOrEqual(budget.maxMounted)
  expect(
    stats?.maxUnmeasuredMountedCount ?? 0,
    `${label} mounted too many unmeasured rows`,
  ).toBeLessThanOrEqual(budget.maxUnmeasured)
}

describe('mounted REPL flicker oracle', () => {
  it('shows the built-in status line without generic helper hints', { timeout: ORACLE_TEST_TIMEOUT_MS }, async () => {
    await withMountedReplEnv(async () => {
      const { terminal } = await mountRepl()
      const ink = getMountedInkProbe(terminal)
      expect(ink).toBeDefined()

      const screenText = readScreenText(ink!.frontFrame.screen)
      expect(screenText).not.toContain('? for shortcuts')
      expect(screenText).not.toContain('/ for commands')
      expectPromptFooterModules(screenText, {
        cwdSegment: TEST_CWD_SEGMENT,
        label: 'initial prompt screen',
      })
    })
  })

  it('enters transcript mode without destructive repaints', { timeout: ORACLE_TEST_TIMEOUT_MS }, async () => {
    await withMountedReplEnv(async () => {
      const { terminal, frames } = await mountRepl()
      const ink = getMountedInkProbe(terminal)
      expect(ink).toBeDefined()
      terminal.clearOutput()
      const start = frames.length

      await writeInput(terminal.stdin, '\u000f')
      await waitFor(
        () => mountedScreenIncludes(ink, 'Showing detailed transcript'),
        'ctrl+o never entered transcript mode',
        TRANSCRIPT_SETTLE_TIMEOUT_MS,
      )

      const transcriptFrames = frames.slice(start)
      const output = terminal.getOutput()
      assertInteractionContract(
        'transcript toggle',
        transcriptFrames,
        output,
        {
          maxBytes: 1800,
          maxMeasured: 5000,
          maxVisited: 16000,
        },
        readFrameMetrics,
      )

      const screenText = readScreenText(ink!.frontFrame.screen)
      expect(screenText).toContain('Showing detailed transcript')
      expect(screenText).toContain('ctrl+o to toggle')
      expectPromptFooterModules(screenText, {
        cwdSegment: TEST_CWD_SEGMENT,
        label: 'transcript toggle screen',
      })
    })
  })

  it('searches and navigates transcript matches without destructive repaints', { timeout: ORACLE_TEST_TIMEOUT_MS }, async () => {
    await withMountedReplEnv(async () => {
      const { terminal, frames } = await mountRepl()
      const ink = getMountedInkProbe(terminal)
      expect(ink).toBeDefined()

      await writeInput(terminal.stdin, '\u000f')
      await waitFor(
        () => mountedScreenIncludes(ink, 'Showing detailed transcript'),
        'ctrl+o never entered transcript mode',
        TRANSCRIPT_SETTLE_TIMEOUT_MS,
      )

      terminal.clearOutput()
      const searchStart = frames.length

      await writeInput(terminal.stdin, '/')
      await Bun.sleep(60)
      await writeInput(terminal.stdin, 'assistant')
      await Bun.sleep(120)
      await writeInput(terminal.stdin, '\r')
      await waitFor(
        () => readInkScreenCounter(ink) !== null,
        'transcript search never committed a live counter in the mounted screen',
        TRANSCRIPT_SETTLE_TIMEOUT_MS,
      )
      await Bun.sleep(120)

      const searchFrames = frames.slice(searchStart)
      const searchOutput = terminal.getOutput()
      assertInteractionContract(
        'transcript search',
        searchFrames,
        searchOutput,
        {
          maxBytes: 1800,
          maxMeasured: 4500,
          maxVisited: 15000,
        },
        readFrameMetrics,
      )

      expect(collapseWhitespace(searchOutput)).toContain('n/Ntonavigate')
      const searchCounter = parseMatchCounter(searchOutput)
      expect(searchCounter).not.toBeNull()
      expect(searchCounter?.total).toBe(80)
      expectPromptFooterModules(readScreenText(ink!.frontFrame.screen), {
        cwdSegment: TEST_CWD_SEGMENT,
        label: 'search output footer',
      })
      const screenSearchCounter = readInkScreenCounter(ink)
      expect(screenSearchCounter).not.toBeNull()

      terminal.clearOutput()
      const navStart = frames.length

      await writeInput(terminal.stdin, 'n')
      await waitFor(
        () => {
          const next = readInkScreenCounter(ink)
          return (
            next !== null &&
            screenSearchCounter !== null &&
            next.current !== screenSearchCounter.current
          )
        },
        'n never advanced the current search match',
        TRANSCRIPT_SETTLE_TIMEOUT_MS,
      )

      const navFrames = frames.slice(navStart)
      const navOutput = terminal.getOutput()
      assertInteractionContract(
        'transcript next-match',
        navFrames,
        navOutput,
        {
          maxBytes: 128,
        },
        readFrameMetrics,
      )

      const navCounter = readInkScreenCounter(ink)
      expect(navCounter).not.toBeNull()
      if (navCounter !== null && searchCounter !== null) {
        expect(navCounter.total).toBe(searchCounter.total)
        expect(navCounter.current).not.toBe(searchCounter.current)
      }
      const navScreenText = readScreenText(ink!.frontFrame.screen)
      expectPromptFooterModules(navScreenText, {
        cwdSegment: TEST_CWD_SEGMENT,
        label: 'next-match screen footer',
      })
    })
  })

  it('streams search-overlay updates within frame/byte/Yoga budgets', { timeout: ORACLE_TEST_TIMEOUT_MS }, async () => {
    const result = await runStreamingSearchOverlayScenario()
    assertInteractionContract(
      result.label,
      result.frames,
      result.output,
      {
        maxFrames: 80,
        maxBytes: 1800,
        maxMeasured: 5000,
        maxVisited: 16000,
      },
      readFrameMetrics,
    )
    appendPerfScenarioSummaryIfRequested(result.summary)
    expectVirtualScrollBudget(result.label, result.summary, {
      maxMounted: 96,
      maxUnmeasured: 96,
    })

    expect(collapseWhitespace(result.output)).toContain('n/Ntonavigate')
    expect(result.counter).not.toBeNull()
    expect(result.counter?.total).toBe(80)
  })

  it('holds a real assistant-turn spinner overlay within frame/byte/Yoga budgets', { timeout: ORACLE_TEST_TIMEOUT_MS }, async () => {
    const result = await runAssistantSpinnerScenario()
    assertInteractionContract(
      result.label,
      result.frames,
      result.output,
      {
        maxFrames: 16,
        maxBytes: 512,
        maxMeasured: 1500,
        maxVisited: 4500,
      },
      readFrameMetrics,
    )
    appendPerfScenarioSummaryIfRequested(result.summary)

    expect(result.beforeQueryCalls).toBe(1)
    expect(result.frames.length).toBeGreaterThanOrEqual(3)
    expect(
      result.frames.some(frame => (frame.phases?.bytes ?? 0) > 0),
    ).toBe(true)
  })

  it('types in the prompt over a long transcript within bounded frame and Yoga budgets', { timeout: ORACLE_TEST_TIMEOUT_MS }, async () => {
    const result = await runPromptTypingScenario()
    assertInteractionContract(
      result.label,
      result.frames,
      result.output,
      {
        maxFrames: 24,
        maxBytes: 1200,
        maxMeasured: 2500,
        maxVisited: 7000,
      },
      readFrameMetrics,
    )
    appendPerfScenarioSummaryIfRequested(result.summary)

    expect(result.totalBytes).toBeLessThanOrEqual(6000)
    expect(result.screenText).toContain(result.draft)
    assertInteractionContract(
      'prompt in-place correction over a long transcript',
      result.correctionFrames,
      result.correctionOutput,
      {
        maxFrames: 12,
        maxBytes: 1200,
        maxMeasured: 2500,
        maxVisited: 7000,
      },
      readFrameMetrics,
    )
    expect(result.correctionTotalBytes).toBeLessThanOrEqual(1600)
    expect(result.correctionScreenText).toContain(result.correctedDraft)
    expect(result.correctionScreenText).not.toContain(result.draft)
  })

  it('keeps the visible transcript stable when refocusing the prompt and typing', { timeout: ORACLE_TEST_TIMEOUT_MS }, async () => {
    await withMountedReplEnv(async () => {
      const { terminal, frames } = await mountRepl()
      const ink = getMountedInkProbe(terminal)
      expect(ink).toBeDefined()

      const initialScreenText = readScreenText(ink!.frontFrame.screen)
      const transcriptBand = readTranscriptBandAbovePrompt(initialScreenText)
      const promptRow = findPromptRow(initialScreenText)

      terminal.clearOutput()
      const start = frames.length

      await writeInput(terminal.stdin, '\u001b[O')
      await Bun.sleep(20)
      await writeInput(terminal.stdin, '\u001b[I')
      await Bun.sleep(20)
      await writeInput(terminal.stdin, sgrMouse(0, 3, promptRow + 1, 'press'))
      await Bun.sleep(20)
      await writeInput(terminal.stdin, sgrMouse(0, 3, promptRow + 1, 'release'))
      await Bun.sleep(20)
      await writeInput(terminal.stdin, 'a')

      await waitFor(() => {
        const currentScreen = readScreenText(ink!.frontFrame.screen)
        const currentPromptRow = findPromptRow(currentScreen)
        return currentScreen.split('\n')[currentPromptRow]?.includes('a') ?? false
      }, 'click + type never updated the live prompt row')

      await Bun.sleep(80)

      const currentScreenText = readScreenText(ink!.frontFrame.screen)
      const currentTranscriptBand = readTranscriptBandAbovePrompt(currentScreenText)
      const interactionFrames = frames.slice(start)
      const output = terminal.getOutput()

      assertInteractionContract(
        'prompt refocus + typing',
        interactionFrames,
        output,
        {
          maxFrames: 18,
          maxBytes: 600,
          maxMeasured: 3000,
          maxVisited: 9000,
        },
        readFrameMetrics,
      )

      expect(currentTranscriptBand).toBe(transcriptBand)
      const currentPromptRow = findPromptRow(currentScreenText)
      expect(
        currentScreenText.split('\n')[currentPromptRow]?.trimStart(),
      ).toMatch(/^❯\s*a/)
    })
  })

  it('scrolls long transcripts within frame/byte/Yoga budgets without destructive clears', { timeout: ORACLE_TEST_TIMEOUT_MS }, async () => {
    const result = await runLongScrollScenario()

    assertInteractionContract(
      'long transcript full-page up scroll',
      result.scrollUpFrames,
      result.scrollUpOutput,
      {
        maxFrames: 90,
        maxBytes: 2200,
        maxMeasured: 6000,
        maxVisited: 19000,
      },
      readFrameMetrics,
    )

    assertInteractionContract(
      'long transcript full-page down scroll',
      result.scrollDownFrames,
      result.scrollDownOutput,
      {
        maxFrames: 90,
        maxBytes: 2200,
        maxMeasured: 6000,
        maxVisited: 19000,
      },
      readFrameMetrics,
    )

    appendPerfScenarioSummaryIfRequested(result.summary)
    expectVirtualScrollBudget(result.label, result.summary, {
      maxMounted: 96,
      maxUnmeasured: 96,
    })

    expect(result.tailIndex).not.toBeNull()
    expect(result.scrolledIndex).not.toBeNull()
    expect(result.recoveredIndex).not.toBeNull()
    if (
      result.tailIndex !== null &&
      result.scrolledIndex !== null &&
      result.recoveredIndex !== null
    ) {
      expect(result.scrolledIndex).toBeLessThan(result.tailIndex)
      expect(result.recoveredIndex).toBeGreaterThanOrEqual(result.tailIndex)
    }
  })

  it('scrolls a file-heavy long transcript with bounded virtual mounts', { timeout: ORACLE_TEST_TIMEOUT_MS }, async () => {
    const result = await runLongHistoryScenario()

    assertInteractionContract(
      result.label,
      result.frames,
      result.output,
      {
        maxFrames: 140,
        maxBytes: 1800,
        maxMeasured: 3000,
        maxVisited: 7000,
      },
      readFrameMetrics,
    )

    appendPerfScenarioSummaryIfRequested(result.summary)
    expectVirtualScrollBudget(result.label, result.summary, {
      maxMounted: 48,
      maxUnmeasured: 48,
    })

    expect(result.tailIndex).not.toBeNull()
    expect(result.scrolledIndex).not.toBeNull()
    expect(result.recoveredIndex).not.toBeNull()
    if (
      result.tailIndex !== null &&
      result.scrolledIndex !== null &&
      result.recoveredIndex !== null
    ) {
      expect(result.scrolledIndex).toBeLessThan(result.tailIndex)
      expect(result.recoveredIndex).toBeGreaterThanOrEqual(result.tailIndex)
    }
  })
})
