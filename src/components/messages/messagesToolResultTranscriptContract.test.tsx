import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import React from 'react'
import { App } from '../App.js'
import { Messages } from '../Messages.js'
import { createRoot, type Root } from '../../ink/root.js'
import { getDefaultAppState } from '../../state/AppState.js'
import {
  createFakeTerminal,
  getMountedInkProbe,
  installReplPerfEnvironment,
  readScreenText,
  waitFor,
} from '../../ink/replPerfHarness.js'
import {
  expectRowsToContainSubstringsInOrder,
  expectRowsToContainSubstring,
  waitForMountedVisibleRows,
} from '../../testing/replScreenContractHarness.js'
import { expectTextSnapshot } from '../../testing/textSnapshotHarness.js'
import { BashTool } from '../../tools/BashTool/BashTool.js'
import {
  CANCEL_MESSAGE,
  createAssistantMessage,
  createUserMessage,
  REJECT_MESSAGE_WITH_REASON_PREFIX,
} from '../../utils/messages.js'

const ORIGINAL_NO_FLICKER = process.env.CLAUDE_CODE_NO_FLICKER
const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY

let mountedRoot: Root | null = null

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

async function mountTranscriptMessages(
  messages: Parameters<typeof Messages>[0]['messages'],
  options?: { hideLogo?: boolean; rows?: number },
) {
  installReplPerfEnvironment()
  const terminal = createFakeTerminal(60, options?.rows ?? 28)
  let frames = 0

  mountedRoot = await createRoot({
    stdout: terminal.stdout,
    stdin: terminal.stdin,
    stderr: terminal.stderr,
    exitOnCtrlC: false,
    patchConsole: false,
    onFrame: () => {
      frames += 1
    },
  })

  mountedRoot.render(
    <App getFpsMetrics={() => undefined} initialState={getDefaultAppState()}>
      <Messages
        messages={messages}
        tools={[BashTool]}
        commands={[]}
        verbose={false}
        toolJSX={null}
        toolUseConfirmQueue={[]}
        inProgressToolUseIDs={new Set<string>()}
        isMessageSelectorVisible={false}
        conversationId="messages-tool-result-contract"
        screen="transcript"
        streamingToolUses={[]}
        showAllInTranscript={true}
        isLoading={false}
        hideLogo={options?.hideLogo ?? false}
      />
    </App>,
  )

  await waitFor(() => frames > 0, 'Messages transcript contract never rendered a frame')
  await Bun.sleep(120)

  const ink = getMountedInkProbe(terminal)
  if (!ink) {
    throw new Error('Messages transcript contract never exposed an ink probe')
  }

  return { terminal, ink }
}

beforeEach(() => {
  process.env.CLAUDE_CODE_NO_FLICKER = '1'
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

afterEach(async () => {
  if (mountedRoot) {
    mountedRoot.unmount()
    mountedRoot = null
  }
  await Bun.sleep(0)
})

describe('Messages transcript tool-result contracts', () => {
  test('shows interrupted Bash tool-result rows', async () => {
    const command = 'sleep 60'
    const { ink } = await mountTranscriptMessages(
      [
        createUserMessage({ content: 'show interrupted transcript' }),
        createBashToolUseTurn(command),
        createBashToolResultTurn(CANCEL_MESSAGE, CANCEL_MESSAGE),
      ],
      { hideLogo: true },
    )

    const rows = await waitForMountedVisibleRows(
      ink,
      visibleRows =>
        visibleRows.some(row => row.includes(command)) &&
        visibleRows.some(row => row.includes('Conversation interrupted')),
      {
        timeoutMs: 4000,
        label: 'messages transcript never showed the interrupted Bash command and status rows',
      },
    )

    expectRowsToContainSubstringsInOrder(
      rows,
      [command, 'Conversation interrupted'],
      'interrupted tool-result transcript rows',
    )
    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/messagesToolResultTranscriptContract__interrupted_bash_tool_result.snap',
        import.meta.url,
      ),
      source: 'src/components/messages/messagesToolResultTranscriptContract.test.tsx',
      expression: 'interrupted_bash_tool_result',
      value: rows.join('\n'),
    })
  })

  test('shows rejected Bash tool-result rows', async () => {
    const command = 'rm -rf tmp-contract-dir'
    const { ink } = await mountTranscriptMessages(
      [
        createUserMessage({ content: 'show rejected transcript' }),
        createBashToolUseTurn(command),
        createBashToolResultTurn(
          `${REJECT_MESSAGE_WITH_REASON_PREFIX}Please stop and wait for instructions.`,
          'User rejected tool use',
          { isError: true },
        ),
      ],
      { hideLogo: true },
    )

    const rows = await waitForMountedVisibleRows(
      ink,
      visibleRows =>
        visibleRows.some(row => row.includes(command)) &&
        visibleRows.some(row => row.includes('Tool use rejected')),
      {
        timeoutMs: 4000,
        label: 'messages transcript never showed the rejected Bash command and status rows',
      },
    )

    expectRowsToContainSubstringsInOrder(
      rows,
      [command, 'Tool use rejected'],
      'rejected tool-result transcript rows',
    )
    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/messagesToolResultTranscriptContract__rejected_bash_tool_result.snap',
        import.meta.url,
      ),
      source: 'src/components/messages/messagesToolResultTranscriptContract.test.tsx',
      expression: 'rejected_bash_tool_result',
      value: rows.join('\n'),
    })
  })

  test('shows failed Bash tool-result rows', async () => {
    const command = 'mkdir /root/blocked-dir'
    const { ink } = await mountTranscriptMessages(
      [
        createUserMessage({ content: 'show failed transcript' }),
        createBashToolUseTurn(command),
        createBashToolResultTurn(
          '<tool_use_error>Error calling tool (Bash): permission denied</tool_use_error>',
          'Error calling tool (Bash): permission denied',
          { isError: true },
        ),
      ],
      { hideLogo: true },
    )

    const rows = await waitForMountedVisibleRows(
      ink,
      visibleRows =>
        visibleRows.some(row => row.includes(command)) &&
        visibleRows.some(row => row.includes('Error calling tool')) &&
        visibleRows.some(row => row.includes('permission denied')),
      {
        timeoutMs: 4000,
        label: 'messages transcript never showed the failed Bash command and error rows',
      },
    )

    expectRowsToContainSubstringsInOrder(
      rows,
      [command, 'Error calling tool', 'permission denied'],
      'failed tool-result transcript rows',
    )
    expectRowsToContainSubstring(rows, 'Error calling tool', 'error tool-result prefix')
    expectRowsToContainSubstring(rows, 'permission denied', 'error tool-result message')
    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/messagesToolResultTranscriptContract__failed_bash_tool_result.snap',
        import.meta.url,
      ),
      source: 'src/components/messages/messagesToolResultTranscriptContract.test.tsx',
      expression: 'failed_bash_tool_result',
      value: rows.join('\n'),
    })
  })
})
