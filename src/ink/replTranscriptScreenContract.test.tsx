import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import {
  cleanupMountedRepl,
  getMountedInkProbe,
  mountRepl,
  readScreenText,
  waitFor,
  writeInput,
} from './replPerfHarness.js'
import {
  expectRowsToContainSubstringsInOrder,
  rowsContainSubstringsInDistinctOrder,
  waitForMountedVisibleRows,
} from '../testing/replScreenContractHarness.js'
import { expectTextSnapshot } from '../testing/textSnapshotHarness.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import {
  createAssistantMessage,
  createUserMessage,
  INTERRUPT_MESSAGE_FOR_TOOL_USE,
} from '../utils/messages.js'

const mainLoopModelPaths = [
  import.meta.resolve('../hooks/useMainLoopModel.js'),
  import.meta.resolve('../hooks/useMainLoopModel.ts'),
]

for (const mainLoopModelPath of mainLoopModelPaths) {
  mock.module(mainLoopModelPath, () => ({
    useMainLoopModel() {
      return 'claude-sonnet-4-6'
    },
  }))
}

const ORIGINAL_NO_FLICKER = process.env.CLAUDE_CODE_NO_FLICKER
const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY
let originalStartupNoticeState: {
  opus1mMergeNoticeSeenCount?: number
  voiceNoticeSeenCount?: number
} | null = null

function normalizeTranscriptSnapshotRows(rows: readonly string[]): string {
  return rows
    .map(row =>
      row.replace(/\d{2}:\d{2} [AP]M <synthetic>/g, '<synthetic-time>'),
    )
    .join('\n')
}

beforeEach(() => {
  process.env.CLAUDE_CODE_NO_FLICKER = '1'
  process.env.ANTHROPIC_API_KEY = 'test-key'
  const current = getGlobalConfig()
  originalStartupNoticeState = {
    opus1mMergeNoticeSeenCount: current.opus1mMergeNoticeSeenCount,
    voiceNoticeSeenCount: current.voiceNoticeSeenCount,
  }
  saveGlobalConfig(config => ({
    ...config,
    opus1mMergeNoticeSeenCount: 999,
    voiceNoticeSeenCount: 999,
  }))
})

afterEach(async () => {
  await cleanupMountedRepl()
  if (originalStartupNoticeState) {
    saveGlobalConfig(config => ({
      ...config,
      opus1mMergeNoticeSeenCount:
        originalStartupNoticeState?.opus1mMergeNoticeSeenCount,
      voiceNoticeSeenCount: originalStartupNoticeState?.voiceNoticeSeenCount,
    }))
  }
})

afterAll(() => {
  if (ORIGINAL_NO_FLICKER === undefined) {
    delete process.env.CLAUDE_CODE_NO_FLICKER
  } else {
    process.env.CLAUDE_CODE_NO_FLICKER = ORIGINAL_NO_FLICKER
  }

  if (ORIGINAL_API_KEY === undefined) {
    delete process.env.ANTHROPIC_API_KEY
  } else {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY
  }
})

describe('mounted REPL transcript visible screen contracts', () => {
  test('keeps wrapped transcript history from splitting words mid-word', async () => {
    const sample =
      "Years passed, and Willowmere thrived in peace and friendship. Mira's herb garden flourished with both ordinary and enchanted plants, and travelers spoke of the kindness of the woman who tended them."

    const { terminal } = await mountRepl({
      messageCount: 0,
      terminalColumns: 40,
      terminalRows: 26,
      replProps: {
        initialMessages: [
          createUserMessage({ content: 'show transcript' }),
          createAssistantMessage({ content: sample }),
        ],
      },
    })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    await writeInput(terminal.stdin, '\u000f')
    await waitFor(
      () =>
        readScreenText(ink!.frontFrame.screen).includes(
          'Showing detailed transcript',
        ),
      'ctrl+o never entered transcript mode for wrap contract',
      4000,
    )

    const rows = await waitForMountedVisibleRows(
      ink,
      visibleRows =>
        rowsContainSubstringsInDistinctOrder(visibleRows, [
          'show transcript',
          'both ordinary',
        ]),
      {
        timeoutMs: 4000,
        label: 'wrapped transcript content never settled into view',
      },
    )
    const screenText = rows.join('\n')
    const snapshotText = normalizeTranscriptSnapshotRows(rows)

    expect(screenText).not.toContain('bo\nth')
    expect(screenText).not.toContain('insi\nde')
    expectRowsToContainSubstringsInOrder(
      rows,
      ['show transcript', 'both ordinary'],
      'wrapped transcript visible rows',
    )
    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/replTranscriptScreenContract__wrapped_transcript_surface.snap',
        import.meta.url,
      ),
      source: 'src/ink/replTranscriptScreenContract.test.tsx',
      expression: 'wrapped_transcript_surface',
      value: snapshotText,
    })
  })

  test('preserves emoji and CJK characters in transcript mode history', async () => {
    const sample = '😀😀😀😀😀 你好世界 codex-style transcript contract'

    const { terminal } = await mountRepl({
      messageCount: 0,
      terminalColumns: 32,
      terminalRows: 26,
      replProps: {
        initialMessages: [
          createUserMessage({ content: 'show unicode transcript' }),
          createAssistantMessage({ content: sample }),
        ],
      },
    })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    await writeInput(terminal.stdin, '\u000f')
    await waitFor(
      () =>
        readScreenText(ink!.frontFrame.screen).includes(
          'Showing detailed transcript',
        ),
      'ctrl+o never entered transcript mode for unicode contract',
      4000,
    )

    const rows = await waitForMountedVisibleRows(
      ink,
      visibleRows =>
        rowsContainSubstringsInDistinctOrder(visibleRows, [
          'show unicode transcript',
          '你好世界',
        ]),
      {
        timeoutMs: 4000,
        label: 'unicode transcript content never settled into view',
      },
    )
    const screenText = rows.join('\n')
    const snapshotText = normalizeTranscriptSnapshotRows(rows)

    for (const char of [...sample].filter(char => !/\s/.test(char))) {
      expect(
        screenText.includes(char),
        `visible transcript screen is missing glyph ${JSON.stringify(char)}:\n${screenText}`,
      ).toBe(true)
    }
    expectRowsToContainSubstringsInOrder(
      rows,
      ['show unicode transcript', '你好世界'],
      'unicode transcript visible rows',
    )
    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/replTranscriptScreenContract__unicode_transcript_surface.snap',
        import.meta.url,
      ),
      source: 'src/ink/replTranscriptScreenContract.test.tsx',
      expression: 'unicode_transcript_surface',
      value: snapshotText,
    })
  })

  test('shows interrupted user transcript rows in transcript mode', async () => {
    const { terminal } = await mountRepl({
      messageCount: 0,
      terminalColumns: 60,
      terminalRows: 28,
      replProps: {
        initialMessages: [
          createUserMessage({ content: 'show interrupt transcript' }),
          createUserMessage({ content: INTERRUPT_MESSAGE_FOR_TOOL_USE }),
        ],
      },
    })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    await writeInput(terminal.stdin, '\u000f')
    await waitFor(
      () =>
        readScreenText(ink!.frontFrame.screen).includes(
          'Showing detailed transcript',
        ),
      'ctrl+o never entered transcript mode for interrupt contract',
      4000,
    )

    const rows = await waitForMountedVisibleRows(
      ink,
      visibleRows =>
        rowsContainSubstringsInDistinctOrder(visibleRows, [
          'show interrupt transcript',
          'Conversation interrupted',
        ]),
      {
        timeoutMs: 4000,
        label: 'interrupted user transcript content never settled into view',
      },
    )
    const screenText = rows.join('\n')
    const snapshotText = normalizeTranscriptSnapshotRows(rows)

    expectRowsToContainSubstringsInOrder(
      rows,
      ['show interrupt transcript', 'Conversation interrupted'],
      'interrupt transcript visible rows',
    )
    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/replTranscriptScreenContract__interrupted_transcript_surface.snap',
        import.meta.url,
      ),
      source: 'src/ink/replTranscriptScreenContract.test.tsx',
      expression: 'interrupted_transcript_surface',
      value: snapshotText,
    })
  })
})
