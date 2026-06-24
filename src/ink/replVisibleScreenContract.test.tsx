import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import {
  cleanupMountedRepl,
  getMountedInkProbe,
  mountRepl,
  writeInput,
} from './replPerfHarness.js'
import {
  expectRowsToContainSubstring,
  expectRowsToContainSubstringsInOrder,
  readMountedScreenText,
  readPromptBand,
  readVisibleRows,
  waitForMountedVisibleRows,
} from '../testing/replScreenContractHarness.js'
import { expectTextSnapshot } from '../testing/textSnapshotHarness.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import {
  getStartupCwdDisplayText,
  getWideStartupModelSummaryText,
  getWideStartupVisibleRowContract,
} from '../utils/startupPromptOutput.js'
import { renderStarshipStatusLineText } from '../components/statusLine/starshipStatusLine.js'

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

describe('mounted REPL visible screen contracts', () => {
  test('keeps all characters visible when a long prompt token wraps', async () => {
    const token = 'Q'.repeat(45)
    const { terminal } = await mountRepl({
      messageCount: 0,
      terminalColumns: 20,
      terminalRows: 24,
    })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    await writeInput(terminal.stdin, token)
    await Bun.sleep(120)

    const promptBand = readPromptBand(readMountedScreenText(ink), {
      rowsBelow: 4,
    })
    const visibleTokenChars = [...promptBand].filter(char => char === 'Q').length

    expect(visibleTokenChars).toBe(token.length)
    const promptRows = readVisibleRows(promptBand)
    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/replVisibleScreenContract__wrapped_prompt_surface.snap',
        import.meta.url,
      ),
      source: 'src/ink/replVisibleScreenContract.test.tsx',
      expression: 'wrapped_prompt_surface',
      value: promptRows.join('\n'),
    })
  })

  test('preserves emoji and CJK glyphs in the mounted prompt viewport', async () => {
    const sample = '😀😀😀😀😀 你好世界'
    const { terminal } = await mountRepl({
      messageCount: 0,
      terminalColumns: 24,
      terminalRows: 24,
    })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    await writeInput(terminal.stdin, sample)
    await Bun.sleep(120)

    const promptBand = readPromptBand(readMountedScreenText(ink), {
      rowsBelow: 3,
    })

    for (const char of [...sample].filter(char => !/\s/.test(char))) {
      expect(
        promptBand.includes(char),
        `mounted prompt band is missing glyph ${JSON.stringify(char)}:\n${promptBand}`,
      ).toBe(true)
    }

    const promptRows = readVisibleRows(promptBand)
    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/replVisibleScreenContract__unicode_prompt_surface.snap',
        import.meta.url,
      ),
      source: 'src/ink/replVisibleScreenContract.test.tsx',
      expression: 'unicode_prompt_surface',
      value: promptRows.join('\n'),
    })
  })

  test('shows stable visible rows for the welcome surface and prompt footer', async () => {
    const { terminal } = await mountRepl({
      messageCount: 0,
    })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()
    const startupRows = getWideStartupVisibleRowContract({
      welcomeMessage: 'Welcome back!',
      modelSummary: getWideStartupModelSummaryText({
        modelDisplayName: 'Sonnet 4.6',
        billingType: 'API Usage Billing',
      }),
      cwdDisplay: getStartupCwdDisplayText({
        cwd: process.cwd(),
      }),
    })
    const footerText = renderStarshipStatusLineText({
      modelName: 'Sonnet 4.6',
      effortLevel: 'high',
      contextRemaining: null,
      cwd: process.cwd(),
      permissionMode: 'default',
    })

    const rows = await waitForMountedVisibleRows(
      ink,
      visibleRows =>
        visibleRows.some(row => row.includes(footerText)) &&
        startupRows.every(expectedRow =>
          visibleRows.some(row => row.includes(expectedRow)),
        ),
      {
        timeoutMs: 3000,
        label: 'mounted startup rows',
      },
    )

    expectRowsToContainSubstringsInOrder(
      rows,
      startupRows,
      'mounted startup visible rows',
    )
    expectRowsToContainSubstring(rows, footerText, 'mounted prompt footer row')
    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/replVisibleScreenContract__startup_welcome_surface.snap',
        import.meta.url,
      ),
      source: 'src/ink/replVisibleScreenContract.test.tsx',
      expression: 'startup_welcome_surface',
      value: rows.join('\n'),
    })
  })

  test('does not keep repainting the startup logo after messages exist in normal scrollback mode', async () => {
    process.env.CLAUDE_CODE_NO_FLICKER = '0'
    const { terminal } = await mountRepl({
      messageCount: 1,
      terminalColumns: 100,
      terminalRows: 30,
    })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    const visibleRows = readVisibleRows(readMountedScreenText(ink))

    expect(
      visibleRows.some(row => row.includes('Code v')),
      `startup logo should not remain in active message repaint surface:\n${visibleRows.join('\n')}`,
    ).toBe(false)
    expectRowsToContainSubstring(
      visibleRows,
      'user-0',
      'mounted message rows after startup',
    )
  })
})

afterEach(() => {
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
