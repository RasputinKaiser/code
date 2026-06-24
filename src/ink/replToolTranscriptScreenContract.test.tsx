import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test'
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
  expectRowsToContainSubstring,
  readVisibleRows,
  rowsContainSubstring,
  waitForMountedVisibleRows,
} from '../testing/replScreenContractHarness.js'
import { expectTextSnapshot } from '../testing/textSnapshotHarness.js'
import { BashTool } from '../tools/BashTool/BashTool.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import {
  CANCEL_MESSAGE,
  REJECT_MESSAGE_WITH_REASON_PREFIX,
  createAssistantMessage,
  createUserMessage,
} from '../utils/messages.js'

const ORIGINAL_NO_FLICKER = process.env.CLAUDE_CODE_NO_FLICKER
const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY
let originalStartupNoticeState: {
  opus1mMergeNoticeSeenCount?: number
  voiceNoticeSeenCount?: number
} | null = null

function createBashToolUseTurn(command: string) {
  return createAssistantMessage({
    content: [
      {
        type: 'tool_use' as const,
        id: 'toolu_bash_contract',
        name: 'Bash',
        input: { command },
      },
    ],
  })
}

function createBashToolResultTurn(
  content: string,
  toolUseResult: unknown,
  options?: { isError?: boolean },
) {
  return createUserMessage({
    content: [
      {
        type: 'tool_result' as const,
        tool_use_id: 'toolu_bash_contract',
        content,
        ...(options?.isError ? { is_error: true } : {}),
      },
    ],
    toolUseResult,
  })
}

async function enterTranscriptMode(terminal: { stdin: NodeJS.WritableStream }, ink: ReturnType<typeof getMountedInkProbe>) {
  await waitForMountedVisibleRows(
    ink,
    rows => rowsContainSubstring(rows, '❯'),
    {
      timeoutMs: 4000,
      label: 'mounted REPL never reached a ready prompt before transcript toggle',
    },
  )
  const beforeToggle = readScreenText(ink!.frontFrame.screen)
  await writeInput(terminal.stdin, '\u000f')
  try {
    await waitForMountedVisibleRows(
      ink,
      rows => rowsContainSubstring(rows, 'Showing detailed transcript'),
      {
        timeoutMs: 4000,
        label: 'ctrl+o never entered transcript mode for tool transcript contract',
      },
    )
  } catch {
    throw new Error(
      `ctrl+o never entered transcript mode for tool transcript contract.\nBefore:\n${beforeToggle}\n\nAfter:\n${readScreenText(
        ink!.frontFrame.screen,
      )}`,
    )
  }
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

describe('mounted REPL tool transcript visible screen contracts', () => {
  test('shows Bash tool use summary and stdout result in transcript mode', async () => {
    const command = "printf 'hello from bash\\n'"

    const { terminal } = await mountRepl({
      messageCount: 0,
      terminalColumns: 60,
      terminalRows: 28,
      replProps: {
        initialTools: [BashTool],
        initialMessages: [
          createUserMessage({ content: 'show tool transcript' }),
          createBashToolUseTurn(command),
          createBashToolResultTurn('completed', {
            stdout: 'hello from bash\n',
            stderr: '',
            interrupted: false,
          }),
        ],
      },
    })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    await enterTranscriptMode(terminal, ink)

    const rows = await waitForMountedVisibleRows(
      ink,
      visibleRows =>
        visibleRows.some(row => row.includes('printf')) &&
        visibleRows.some(row => row.includes('hello from bash')),
      {
        timeoutMs: 4000,
        label: 'tool transcript stdout content never settled into view',
      },
    )

    expectRowsToContainSubstringsInOrder(
      rows,
      ['printf', 'hello from bash'],
      'bash tool summary and stdout transcript rows',
    )
    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/replToolTranscriptScreenContract__bash_stdout_surface.snap',
        import.meta.url,
      ),
      source: 'src/ink/replToolTranscriptScreenContract.test.tsx',
      expression: 'bash_stdout_surface',
      value: rows.join('\n'),
    })
  })

  test('shows Done for successful Bash tool results with no output', async () => {
    const command = 'mkdir tmp-contract-dir'

    const { terminal } = await mountRepl({
      messageCount: 0,
      terminalColumns: 60,
      terminalRows: 28,
      replProps: {
        initialTools: [BashTool],
        initialMessages: [
          createUserMessage({ content: 'show no output transcript' }),
          createBashToolUseTurn(command),
          createBashToolResultTurn('completed', {
            stdout: '',
            stderr: '',
            interrupted: false,
            noOutputExpected: true,
          }),
        ],
      },
    })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    await enterTranscriptMode(terminal, ink)

    const rows = await waitForMountedVisibleRows(
      ink,
      visibleRows =>
        visibleRows.some(row => row.includes('mkdir')) &&
        visibleRows.some(row => row.includes('Done')),
      {
        timeoutMs: 4000,
        label: 'tool transcript no-output content never settled into view',
      },
    )

    expectRowsToContainSubstringsInOrder(
      rows,
      ['mkdir', 'Done'],
      'bash tool summary and no-output result transcript rows',
    )
    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/replToolTranscriptScreenContract__bash_done_surface.snap',
        import.meta.url,
      ),
      source: 'src/ink/replToolTranscriptScreenContract.test.tsx',
      expression: 'bash_done_surface',
      value: rows.join('\n'),
    })
  })

  test('shows interrupted Bash tool results in transcript mode', async () => {
    const command = 'sleep 60'

    const { terminal } = await mountRepl({
      messageCount: 0,
      terminalColumns: 60,
      terminalRows: 28,
      replProps: {
        initialTools: [BashTool],
        initialMessages: [
          createUserMessage({ content: 'show interrupted transcript' }),
          createBashToolUseTurn(command),
          createBashToolResultTurn(CANCEL_MESSAGE, CANCEL_MESSAGE),
        ],
      },
    })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    await enterTranscriptMode(terminal, ink)

    const rows = await waitForMountedVisibleRows(
      ink,
      visibleRows =>
        visibleRows.some(row => row.includes('sleep 60')) &&
        visibleRows.some(row => row.includes('Conversation interrupted')),
      {
        timeoutMs: 4000,
        label: 'tool transcript interrupted content never settled into view',
      },
    )

    expectRowsToContainSubstringsInOrder(
      rows,
      ['sleep 60', 'Conversation interrupted'],
      'bash tool summary and interrupted result transcript rows',
    )
    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/replToolTranscriptScreenContract__bash_interrupted_surface.snap',
        import.meta.url,
      ),
      source: 'src/ink/replToolTranscriptScreenContract.test.tsx',
      expression: 'bash_interrupted_surface',
      value: rows.join('\n'),
    })
  })

  test('shows explicit Bash rejection results in transcript mode', async () => {
    const command = 'rm -rf tmp-contract-dir'

    const { terminal } = await mountRepl({
      messageCount: 0,
      terminalColumns: 60,
      terminalRows: 28,
      replProps: {
        initialTools: [BashTool],
        initialMessages: [
          createUserMessage({ content: 'show rejected transcript' }),
          createBashToolUseTurn(command),
          createBashToolResultTurn(
            `${REJECT_MESSAGE_WITH_REASON_PREFIX}Please stop and wait for instructions.`,
            'User rejected tool use',
            { isError: true },
          ),
        ],
      },
    })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    await enterTranscriptMode(terminal, ink)

    const rows = await waitForMountedVisibleRows(
      ink,
      visibleRows =>
        visibleRows.some(row => row.includes('rm -rf')) &&
        visibleRows.some(row => row.includes('Tool use rejected')),
      {
        timeoutMs: 4000,
        label: 'tool transcript rejected content never settled into view',
      },
    )

    expectRowsToContainSubstringsInOrder(
      rows,
      ['rm -rf', 'Tool use rejected'],
      'bash tool summary and rejected result transcript rows',
    )
    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/replToolTranscriptScreenContract__bash_rejected_surface.snap',
        import.meta.url,
      ),
      source: 'src/ink/replToolTranscriptScreenContract.test.tsx',
      expression: 'bash_rejected_surface',
      value: rows.join('\n'),
    })
  })

  test('shows Bash execution failures in transcript mode', async () => {
    const command = 'mkdir /root/blocked-dir'
    const detailedError = 'Error calling tool (Bash): permission denied'

    const { terminal } = await mountRepl({
      messageCount: 0,
      terminalColumns: 60,
      terminalRows: 28,
      replProps: {
        initialTools: [BashTool],
        initialMessages: [
          createUserMessage({ content: 'show failed transcript' }),
          createBashToolUseTurn(command),
          createBashToolResultTurn(
            `<tool_use_error>${detailedError}</tool_use_error>`,
            detailedError,
            { isError: true },
          ),
        ],
      },
    })
    const ink = getMountedInkProbe(terminal)
    expect(ink).toBeDefined()

    await enterTranscriptMode(terminal, ink)

    const rows = await waitForMountedVisibleRows(
      ink,
      visibleRows =>
        visibleRows.some(row => row.includes('mkdir /root/blocked-dir')) &&
        visibleRows.some(row => row.includes('Error calling tool')) &&
        visibleRows.some(row => row.includes('permission denied')),
      {
        timeoutMs: 4000,
        label: 'tool transcript error content never settled into view',
      },
    )

    expectRowsToContainSubstringsInOrder(
      rows,
      ['mkdir /root/blocked-dir', 'Error calling tool', 'permission denied'],
      'bash tool summary and error result transcript rows',
    )
    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/replToolTranscriptScreenContract__bash_failed_surface.snap',
        import.meta.url,
      ),
      source: 'src/ink/replToolTranscriptScreenContract.test.tsx',
      expression: 'bash_failed_surface',
      value: rows.join('\n'),
    })
  })
})
