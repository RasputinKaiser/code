import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import React from 'react'
import { Box } from '../ink.js'
import { Message } from '../components/Message.js'
import { MessageRow } from '../components/MessageRow.js'
import { MessageActionsSelectedContext } from '../components/messageActions.js'
import { BashTool } from '../tools/BashTool/BashTool.js'
import { getDefaultAppState } from '../state/AppState.js'
import {
  buildMessageLookups,
  CANCEL_MESSAGE,
  createAssistantMessage,
  createUserMessage,
  REJECT_MESSAGE_WITH_REASON_PREFIX,
} from '../utils/messages.js'
import { App } from '../components/App.js'
import { computeIncrementalNormalizedMessages } from '../components/messages/incrementalNormalizeMessages.js'
import { createRoot, type Root } from './root.js'
import {
  createFakeTerminal,
  getMountedInkProbe,
  installReplPerfEnvironment,
  waitFor,
} from './replPerfHarness.js'
import {
  expectRowsNotToContainSubstring,
  expectRowsToContainSubstringsInDistinctOrder,
  rowsContainSubstringsInDistinctOrder,
  waitForMountedVisibleRows,
} from '../testing/replScreenContractHarness.js'
import { expectTextSnapshot } from '../testing/textSnapshotHarness.js'

const ORIGINAL_NO_FLICKER = process.env.CLAUDE_CODE_NO_FLICKER
const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY

let mountedRoot: Root | null = null

type ToolResultFixture = ReturnType<typeof createToolResultFixture>

function createToolResultFixture(
  paramContent: string,
  toolUseResult: unknown,
  options?: { isError?: boolean; command?: string },
) {
  const assistant = createAssistantMessage({
    content: [
      {
        type: 'tool_use' as const,
        id: 'toolu_bash_contract',
        name: 'Bash',
        input: { command: options?.command ?? 'sleep 60' },
      },
    ],
  })
  const user = createUserMessage({
    content: [
      {
        type: 'tool_result' as const,
        tool_use_id: 'toolu_bash_contract',
        content: paramContent,
        ...(options?.isError ? { is_error: true } : {}),
      },
    ],
    toolUseResult,
  })
  const lookups = buildMessageLookups(
    [assistant, user] as never,
    [assistant, user] as never,
  )

  return { assistant, user, lookups }
}

async function mountNode(node: React.ReactNode, columns = 60, rows = 12) {
  installReplPerfEnvironment()
  const terminal = createFakeTerminal(columns, rows)
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
      {node}
    </App>,
  )

  await waitFor(() => frames > 0, 'mounted contract never rendered a frame')
  await Bun.sleep(80)

  const ink = getMountedInkProbe(terminal)
  if (!ink) {
    throw new Error('mounted contract never exposed an ink probe')
  }

  return { terminal, ink }
}

type VisibleRowsContract = {
  readonly requiredSubstringsInDistinctOrder: readonly string[]
  readonly forbiddenSubstrings?: readonly string[]
  readonly label: string
}

async function expectNodeVisibleRowsContract(
  node: React.ReactNode,
  contract: VisibleRowsContract,
) {
  const { ink } = await mountNode(node)
  const rows = await waitForMountedVisibleRows(
    ink,
    visibleRows =>
      rowsContainSubstringsInDistinctOrder(
        visibleRows,
        contract.requiredSubstringsInDistinctOrder,
      ) &&
      (contract.forbiddenSubstrings ?? []).every(
        unexpectedSubstring =>
          !visibleRows.some(row => row.includes(unexpectedSubstring)),
      ),
    {
      timeoutMs: 4000,
      label: `${contract.label} never settled into the mounted screen`,
    },
  )

  expectRowsToContainSubstringsInDistinctOrder(
    rows,
    contract.requiredSubstringsInDistinctOrder,
    contract.label,
  )

  for (const unexpectedSubstring of contract.forbiddenSubstrings ?? []) {
    expectRowsNotToContainSubstring(rows, unexpectedSubstring, contract.label)
  }

  return rows
}

function renderMessageNode(
  fixture: ToolResultFixture,
  options?: { verbose?: boolean },
) {
  return (
    <Box width={60}>
      <Message
        message={fixture.user}
        lookups={fixture.lookups}
        addMargin={true}
        tools={[BashTool]}
        commands={[]}
        verbose={options?.verbose ?? false}
        inProgressToolUseIDs={new Set<string>()}
        progressMessagesForMessage={[]}
        shouldAnimate={false}
        shouldShowDot={true}
        isTranscriptMode={true}
        isStatic={false}
        latestBashOutputUUID={null}
        lastThinkingBlockId={null}
      />
    </Box>
  )
}

function renderMessageRowNode(
  fixture: ToolResultFixture,
  options?: { verbose?: boolean },
) {
  return (
    <Box width={60}>
      <MessageRow
        message={fixture.user}
        isUserContinuation={false}
        hasContentAfter={false}
        tools={[BashTool]}
        commands={[]}
        verbose={options?.verbose ?? false}
        inProgressToolUseIDs={new Set<string>()}
        streamingToolUseIDs={new Set<string>()}
        screen="transcript"
        canAnimate={false}
        lastThinkingBlockId={null}
        latestBashOutputUUID={null}
        columns={60}
        isLoading={false}
        lookups={fixture.lookups}
      />
    </Box>
  )
}

function renderMessageRowListNode(
  promptText: string,
  fixture: ToolResultFixture,
  options?: { verbose?: boolean },
) {
  const prompt = createUserMessage({ content: promptText })
  const normalizedMessages = computeIncrementalNormalizedMessages([
    prompt,
    fixture.assistant,
    fixture.user,
  ]).normalizedMessages
  const lookups = buildMessageLookups(
    normalizedMessages as never,
    normalizedMessages as never,
  )

  return (
    <Box width={60} flexDirection="column">
      {normalizedMessages.map((message, index) => (
        <MessageRow
          key={message.uuid}
          message={message as never}
          isUserContinuation={
            message.type === 'user' &&
            index > 0 &&
            normalizedMessages[index - 1]?.type === 'user'
          }
          hasContentAfter={false}
          tools={[BashTool]}
          commands={[]}
          verbose={options?.verbose ?? false}
          inProgressToolUseIDs={new Set<string>()}
          streamingToolUseIDs={new Set<string>()}
          screen="transcript"
          canAnimate={false}
          lastThinkingBlockId={null}
          latestBashOutputUUID={null}
          columns={60}
          isLoading={false}
          lookups={lookups}
        />
      ))}
    </Box>
  )
}

function renderProviderWrappedMessageRowListNode(
  promptText: string,
  fixture: ToolResultFixture,
  options?: { verbose?: boolean },
) {
  const prompt = createUserMessage({ content: promptText })
  const normalizedMessages = computeIncrementalNormalizedMessages([
    prompt,
    fixture.assistant,
    fixture.user,
  ]).normalizedMessages
  const lookups = buildMessageLookups(
    normalizedMessages as never,
    normalizedMessages as never,
  )

  return (
    <Box width={60} flexDirection="column">
      {normalizedMessages.map(message => (
        <MessageActionsSelectedContext.Provider
          key={message.uuid}
          value={false}
        >
          <MessageRow
            message={message as never}
            isUserContinuation={false}
            hasContentAfter={false}
            tools={[BashTool]}
            commands={[]}
            verbose={options?.verbose ?? false}
            inProgressToolUseIDs={new Set<string>()}
            streamingToolUseIDs={new Set<string>()}
            screen="transcript"
            canAnimate={false}
            lastThinkingBlockId={null}
            latestBashOutputUUID={null}
            columns={60}
            isLoading={false}
            lookups={lookups}
          />
        </MessageActionsSelectedContext.Provider>
      ))}
    </Box>
  )
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

describe('mounted tool-result render contracts', () => {
  test('Message renders interrupted Bash tool-result rows', async () => {
    const fixture = createToolResultFixture(CANCEL_MESSAGE, CANCEL_MESSAGE)
    await expectNodeVisibleRowsContract(renderMessageNode(fixture), {
      requiredSubstringsInDistinctOrder: ['Conversation interrupted'],
      forbiddenSubstrings: ['Tool use rejected', 'permission denied'],
      label: 'Message interrupted tool-result rows',
    })
  })

  test('Message renders rejected Bash tool-result rows', async () => {
    const fixture = createToolResultFixture(
      `${REJECT_MESSAGE_WITH_REASON_PREFIX}wait`,
      'User rejected tool use',
      { isError: true, command: 'rm -rf tmp-contract-dir' },
    )
    await expectNodeVisibleRowsContract(renderMessageNode(fixture), {
      requiredSubstringsInDistinctOrder: ['Tool use rejected'],
      forbiddenSubstrings: ['Interrupted', 'permission denied'],
      label: 'Message rejected tool-result rows',
    })
  })

  test('Message renders failed Bash tool-result rows', async () => {
    const fixture = createToolResultFixture(
      '<tool_use_error>Error calling tool (Bash): permission denied</tool_use_error>',
      'Error calling tool (Bash): permission denied',
      { isError: true, command: 'mkdir /root/blocked-dir' },
    )
    await expectNodeVisibleRowsContract(renderMessageNode(fixture), {
      requiredSubstringsInDistinctOrder: ['permission denied'],
      forbiddenSubstrings: ['Interrupted', 'Tool use rejected'],
      label: 'Message failed tool-result rows',
    })
  })

  test('MessageRow renders interrupted Bash tool-result rows', async () => {
    const fixture = createToolResultFixture(CANCEL_MESSAGE, CANCEL_MESSAGE)
    await expectNodeVisibleRowsContract(renderMessageRowNode(fixture), {
      requiredSubstringsInDistinctOrder: ['Conversation interrupted'],
      forbiddenSubstrings: ['Tool use rejected', 'permission denied'],
      label: 'MessageRow interrupted tool-result rows',
    })
  })

  test('MessageRow list renders interrupted Bash tool-result rows', async () => {
    const fixture = createToolResultFixture(CANCEL_MESSAGE, CANCEL_MESSAGE)
    const rows = await expectNodeVisibleRowsContract(
      renderMessageRowListNode('show interrupted transcript', fixture),
      {
        requiredSubstringsInDistinctOrder: ['sleep 60', 'Conversation interrupted'],
        forbiddenSubstrings: ['Tool use rejected', 'permission denied'],
        label: 'MessageRow list interrupted tool-result rows',
      },
    )
    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/replToolResultMountedContract__message_row_list_interrupted.snap',
        import.meta.url,
      ),
      source: 'src/ink/replToolResultMountedContract.test.tsx',
      expression: 'message_row_list_interrupted',
      value: rows.join('\n'),
    })
  })

  test('provider-wrapped MessageRow list renders interrupted Bash tool-result rows', async () => {
    const fixture = createToolResultFixture(CANCEL_MESSAGE, CANCEL_MESSAGE)
    await expectNodeVisibleRowsContract(
      renderProviderWrappedMessageRowListNode(
        'show interrupted transcript',
        fixture,
      ),
      {
        requiredSubstringsInDistinctOrder: ['sleep 60', 'Conversation interrupted'],
        forbiddenSubstrings: ['Tool use rejected', 'permission denied'],
        label: 'provider-wrapped MessageRow list interrupted tool-result rows',
      },
    )
  })

  test('MessageRow renders rejected Bash tool-result rows', async () => {
    const fixture = createToolResultFixture(
      `${REJECT_MESSAGE_WITH_REASON_PREFIX}wait`,
      'User rejected tool use',
      { isError: true, command: 'rm -rf tmp-contract-dir' },
    )
    await expectNodeVisibleRowsContract(renderMessageRowNode(fixture), {
      requiredSubstringsInDistinctOrder: ['Tool use rejected'],
      forbiddenSubstrings: ['Interrupted', 'permission denied'],
      label: 'MessageRow rejected tool-result rows',
    })
  })

  test('MessageRow list renders rejected Bash tool-result rows', async () => {
    const fixture = createToolResultFixture(
      `${REJECT_MESSAGE_WITH_REASON_PREFIX}wait`,
      'User rejected tool use',
      { isError: true, command: 'rm -rf tmp-contract-dir' },
    )
    const rows = await expectNodeVisibleRowsContract(
      renderMessageRowListNode('show rejected transcript', fixture),
      {
        requiredSubstringsInDistinctOrder: [
          'rm -rf tmp-contract-dir',
          'Tool use rejected',
        ],
        forbiddenSubstrings: ['Interrupted', 'permission denied'],
        label: 'MessageRow list rejected tool-result rows',
      },
    )
    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/replToolResultMountedContract__message_row_list_rejected.snap',
        import.meta.url,
      ),
      source: 'src/ink/replToolResultMountedContract.test.tsx',
      expression: 'message_row_list_rejected',
      value: rows.join('\n'),
    })
  })

  test('MessageRow renders failed Bash tool-result rows', async () => {
    const fixture = createToolResultFixture(
      '<tool_use_error>Error calling tool (Bash): permission denied</tool_use_error>',
      'Error calling tool (Bash): permission denied',
      { isError: true, command: 'mkdir /root/blocked-dir' },
    )
    await expectNodeVisibleRowsContract(renderMessageRowNode(fixture), {
      requiredSubstringsInDistinctOrder: ['permission denied'],
      forbiddenSubstrings: ['Interrupted', 'Tool use rejected'],
      label: 'MessageRow failed tool-result rows',
    })
  })

  test('MessageRow list renders failed Bash tool-result rows', async () => {
    const fixture = createToolResultFixture(
      '<tool_use_error>Error calling tool (Bash): permission denied</tool_use_error>',
      'Error calling tool (Bash): permission denied',
      { isError: true, command: 'mkdir /root/blocked-dir' },
    )
    const rows = await expectNodeVisibleRowsContract(
      renderMessageRowListNode('show failed transcript', fixture),
      {
        requiredSubstringsInDistinctOrder: [
          'mkdir /root/blocked-dir',
          'permission denied',
        ],
        forbiddenSubstrings: ['Interrupted', 'Tool use rejected'],
        label: 'MessageRow list failed tool-result rows',
      },
    )
    expectTextSnapshot({
      snapshotFileUrl: new URL(
        './snapshots/replToolResultMountedContract__message_row_list_failed.snap',
        import.meta.url,
      ),
      source: 'src/ink/replToolResultMountedContract.test.tsx',
      expression: 'message_row_list_failed',
      value: rows.join('\n'),
    })
  })
})
