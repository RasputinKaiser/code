import { afterEach, describe, expect, it } from 'bun:test'
import React from 'react'
import { PassThrough } from 'stream'
import type { FrameEvent } from './frame.js'
import instances from './instances.js'
import { createRoot, type Root } from './root.js'
import Box from './components/Box.js'
import Text from './components/Text.js'
import { screenToRows, TerminalReplayOracle } from './terminalReplayOracle.js'
import type { Screen } from './screen.js'
import { AppStateProvider, getDefaultAppState } from '../state/AppState.js'
import { KeybindingSetup } from '../keybindings/KeybindingProviderSetup.js'
import { Messages } from '../components/Messages.js'
import {
  PermissionRequest,
  type ToolUseConfirm,
} from '../components/permissions/PermissionRequest.js'
import { AskUserQuestionTool } from '../tools/AskUserQuestionTool/AskUserQuestionTool.js'
import type { ToolUseContext } from '../Tool.js'
import type { AssistantMessage } from '../types/message.js'

type FakeInput = PassThrough &
  NodeJS.ReadStream & {
    isTTY: boolean
    isRaw: boolean
    setRawMode: (raw: boolean) => void
    ref: () => FakeInput
    unref: () => FakeInput
  }

type FakeOutput = PassThrough &
  NodeJS.WriteStream & {
    isTTY: boolean
    columns: number
    rows: number
    getWindowSize: () => [number, number]
  }

type FakeTerminal = {
  stdin: FakeInput
  stdout: FakeOutput
  stderr: FakeOutput
  getChunks: () => string[]
  resetChunks: () => void
}

type MountedInkProbe = {
  frontFrame: {
    screen: Screen
  }
}

type FrameReplayCheckpoint = {
  chunkCount: number
  rows: string[]
}

let liveRoot: Root | null = null

afterEach(async () => {
  if (liveRoot) {
    liveRoot.unmount()
    liveRoot = null
  }
  await Bun.sleep(0)
})

function createFakeInput(): FakeInput {
  const stdin = new PassThrough() as FakeInput
  stdin.isTTY = true
  stdin.isRaw = false
  stdin.setRawMode = raw => {
    stdin.isRaw = raw
  }
  stdin.ref = () => stdin
  stdin.unref = () => stdin
  return stdin
}

function createFakeOutput(columns: number, rows: number): FakeOutput {
  const stdout = new PassThrough() as FakeOutput
  stdout.isTTY = true
  stdout.columns = columns
  stdout.rows = rows
  stdout.getWindowSize = () => [columns, rows]
  return stdout
}

function createFakeTerminal(columns = 50, rows = 16): FakeTerminal {
  let chunks: string[] = []
  const stdout = createFakeOutput(columns, rows)
  const stderr = createFakeOutput(columns, rows)
  stdout.on('data', chunk => {
    chunks.push(chunk.toString())
  })
  return {
    stdin: createFakeInput(),
    stdout,
    stderr,
    getChunks: () => [...chunks],
    resetChunks: () => {
      chunks = []
    },
  }
}

async function waitFor(
  predicate: () => boolean,
  message: string,
  timeoutMs = 1500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await Bun.sleep(10)
  }
  throw new Error(message)
}

function PreviewHarness({ showPreview }: { showPreview: boolean }): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Text>normal-header</Text>
      {showPreview ? (
        <Box flexDirection="column">
          {Array.from({ length: 10 }, (_, index) => (
            <Text key={index}>PREVIEW-LINE-{index}-xxxxxxxxxxxxxxxxxxxx</Text>
          ))}
        </Box>
      ) : null}
      <Text>normal-footer</Text>
    </Box>
  )
}

function assertReplayCheckpoints(
  terminal: FakeTerminal,
  checkpoints: FrameReplayCheckpoint[],
): void {
  const oracle = new TerminalReplayOracle({
    width: terminal.stdout.columns,
    height: terminal.stdout.rows,
  })
  const chunks = terminal.getChunks()
  let nextCheckpoint = 0
  for (let index = 0; index < chunks.length; index += 1) {
    oracle.feed(chunks[index]!)
    while (checkpoints[nextCheckpoint]?.chunkCount === index + 1) {
      const expected = checkpoints[nextCheckpoint]!.rows
      const actual = oracle.visibleRows().slice(0, expected.length)
      if (actual.join('\n') !== expected.join('\n')) {
        throw new Error(
          [
            `Terminal replay does not match rendered frame ${nextCheckpoint}.`,
            '--- expected ---',
            expected.join('\n'),
            '--- actual ---',
            actual.join('\n'),
          ].join('\n'),
        )
      }
      nextCheckpoint += 1
    }
  }
  expect(nextCheckpoint).toBe(checkpoints.length)
}

function makeToolUseContext(): ToolUseContext {
  return {
    messages: [],
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'test-model',
      tools: [],
      verbose: false,
      thinkingConfig: {},
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: false,
      agentDefinitions: { type: 'success', agents: [] },
    },
    abortController: new AbortController(),
    readFileState: new Map(),
    getAppState: getDefaultAppState,
    setAppState: () => {},
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
  } as unknown as ToolUseContext
}

function makeAskUserQuestionConfirm(
  onDone: () => void,
  onAnswered: () => void,
): ToolUseConfirm {
  const input = {
    questions: [
      {
        header: 'Preview',
        question: 'Which implementation should we ship?',
        options: [
          {
            label: 'Option A',
            description: 'Accept the previewed implementation.',
            preview: Array.from(
              { length: 24 },
              (_, index) =>
                `PERMISSION-PREVIEW-LINE-${String(index).padStart(2, '0')}-${'x'.repeat(50)}`,
            ).join('\n'),
          },
          {
            label: 'Option B',
            description: 'Reject the previewed implementation.',
            preview: Array.from(
              { length: 18 },
              (_, index) =>
                `SECONDARY-PREVIEW-LINE-${String(index).padStart(2, '0')}-${'y'.repeat(30)}`,
            ).join('\n'),
          },
        ],
      },
    ],
  }

  const assistantMessage = {
    type: 'assistant',
    uuid: 'permission-preview-assistant',
    message: {
      id: 'msg_permission_preview',
      type: 'message',
      role: 'assistant',
      model: 'test-model',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
      },
    },
    timestamp: new Date(0).toISOString(),
  } as unknown as AssistantMessage

  const toolUseContext = makeToolUseContext()

  return {
    assistantMessage,
    tool: AskUserQuestionTool,
    description: 'Answer questions?',
    input,
    toolUseContext,
    toolUseID: 'toolu_permission_preview',
    permissionResult: {
      behavior: 'ask',
      message: 'Answer questions?',
      updatedInput: input,
    },
    permissionPromptStartTimeMs: 0,
    onUserInteraction: () => {},
    onAbort: () => {},
    onAllow: () => {
      onAnswered()
    },
    onReject: () => {},
    recheckPermission: async () => {},
  } as unknown as ToolUseConfirm
}

function PermissionPreviewHarness(): React.ReactNode {
  const [showPermission, setShowPermission] = React.useState(true)
  const [answered, setAnswered] = React.useState(false)
  const toolUseContext = React.useMemo(() => makeToolUseContext(), [])
  const toolUseConfirm = React.useMemo(
    () =>
      makeAskUserQuestionConfirm(
        () => setShowPermission(false),
        () => setAnswered(true),
      ),
    [],
  )

  return (
    <AppStateProvider initialState={getDefaultAppState()}>
      <KeybindingSetup>
        <Box flexDirection="column">
          <Text>normal-header</Text>
          {showPermission ? (
            <PermissionRequest
              toolUseConfirm={toolUseConfirm}
              toolUseContext={toolUseContext}
              onDone={() => setShowPermission(false)}
              onReject={() => setShowPermission(false)}
              verbose={false}
              workerBadge={undefined}
            />
          ) : (
            <Text>{answered ? 'normal-footer-answered' : 'normal-footer'}</Text>
          )}
        </Box>
      </KeybindingSetup>
    </AppStateProvider>
  )
}

function compactFileAttachment({
  uuid,
  parentUuid,
  displayPath,
  filePath,
  numLines,
}: {
  uuid: string
  parentUuid: string
  displayPath: string
  filePath: string
  numLines: number
}) {
  return {
    type: 'attachment',
    uuid,
    parentUuid,
    timestamp: '2026-05-21T21:47:32.000Z',
    attachment: {
      type: 'file',
      filename: filePath,
      displayPath,
      truncated: null,
      content: {
        type: 'text',
        file: {
          filePath,
          content: 'x\n'.repeat(numLines),
          numLines,
          startLine: 1,
          totalLines: numLines,
        },
      },
    },
  }
}

function CompactArtifactHarness({
  showAttachments,
  preCompact,
}: {
  showAttachments: boolean
  preCompact?: boolean
}): React.ReactNode {
  const boundary = {
    type: 'system',
    subtype: 'compact_boundary',
    content: 'Conversation compacted',
    isMeta: false,
    level: 'info',
    uuid: 'f609d375-467e-455f-88d2-c82a8a1fe7bf',
    timestamp: '2026-05-21T21:47:32.767Z',
  }
  const summary = {
    type: 'user',
    uuid: 'd00d1ec6-4492-4e24-80fc-d9905110962a',
    parentUuid: boundary.uuid,
    isVisibleInTranscriptOnly: true,
    isCompactSummary: true,
    timestamp: '2026-05-21T21:47:32.767Z',
    message: {
      role: 'user',
      content:
        'This session is being continued from a previous conversation that ran out of context.',
    },
  }
  const attachments = [
    compactFileAttachment({
      uuid: '55224188-6f3b-4144-a6f5-c9a313fcd77f',
      parentUuid: summary.uuid,
      displayPath: 'eden/mononoke/servers/ghes/ghes_service/BUCK',
      filePath:
        '/mlstore/src/noumena/ncode/eden/mononoke/servers/ghes/ghes_service/BUCK',
      numLines: 28,
    }),
    compactFileAttachment({
      uuid: '5774735d-b4f9-43af-97f0-13feeb8ab8ca',
      parentUuid: '55224188-6f3b-4144-a6f5-c9a313fcd77f',
      displayPath: 'eden/mononoke/servers/ghes/ghes_service/src/router.rs',
      filePath:
        '/mlstore/src/noumena/ncode/eden/mononoke/servers/ghes/ghes_service/src/router.rs',
      numLines: 174,
    }),
    compactFileAttachment({
      uuid: 'f09e6235-5c0c-4e74-a3b7-157b796a0ba2',
      parentUuid: '5774735d-b4f9-43af-97f0-13feeb8ab8ca',
      displayPath: 'eden/mononoke/servers/ghes/ghes_server/src/main.rs',
      filePath:
        '/mlstore/src/noumena/ncode/eden/mononoke/servers/ghes/ghes_server/src/main.rs',
      numLines: 75,
    }),
    compactFileAttachment({
      uuid: '4a68383c-2644-41c5-8d4e-b9ae0fbc82f9',
      parentUuid: 'f09e6235-5c0c-4e74-a3b7-157b796a0ba2',
      displayPath:
        '../../../../tmp/ncode-1000/-mlstore-src-noumena-ncode/693f123d-48f2-40ff-88cb-9397f0b685c9/tasks/bgdf4cgji.output',
      filePath:
        '/tmp/ncode-1000/-mlstore-src-noumena-ncode/693f123d-48f2-40ff-88cb-9397f0b685c9/tasks/bgdf4cgji.output',
      numLines: 17,
    }),
  ]
  const messages = preCompact
    ? attachments
    : showAttachments
      ? [boundary, summary, ...attachments]
      : [boundary, summary]

  return (
    <AppStateProvider initialState={getDefaultAppState()}>
      <KeybindingSetup>
        <Messages
          messages={messages as never}
          tools={[]}
          commands={[]}
          verbose={false}
          toolJSX={null}
          toolUseConfirmQueue={[]}
          inProgressToolUseIDs={new Set()}
          isMessageSelectorVisible={false}
          conversationId="compact-artifact"
          screen="prompt"
          streamingToolUses={[]}
          isLoading={false}
          hideLogo={true}
          disableRenderCap={true}
        />
      </KeybindingSetup>
    </AppStateProvider>
  )
}

describe('mounted Ink terminal replay oracle', () => {
  it('matches the final mounted screen after a large preview unmounts', async () => {
    const terminal = createFakeTerminal()
    const frames: FrameEvent[] = []

    liveRoot = await createRoot({
      stdout: terminal.stdout,
      stdin: terminal.stdin,
      stderr: terminal.stderr,
      exitOnCtrlC: false,
      patchConsole: false,
      onFrame: event => {
        frames.push(event)
      },
    })

    liveRoot.render(<PreviewHarness showPreview={true} />)
    await waitFor(
      () => instances.get(terminal.stdout) !== undefined && frames.length > 0,
      'mounted preview never rendered',
    )

    liveRoot.render(<PreviewHarness showPreview={false} />)
    await waitFor(() => frames.length > 1, 'mounted preview never unmounted')

    const ink = instances.get(terminal.stdout)! as unknown as MountedInkProbe
    const oracle = new TerminalReplayOracle({
      width: terminal.stdout.columns,
      height: terminal.stdout.rows,
    })
    for (const chunk of terminal.getChunks()) {
      oracle.feed(chunk)
    }

    oracle.assertScreenAt(ink.frontFrame.screen, 0)
    expect(oracle.text()).not.toContain('PREVIEW-LINE')
    expect(oracle.text()).toContain('normal-footer')
  })

  it('matches the final mounted screen after accepting a real permission preview', async () => {
    const terminal = createFakeTerminal(96, 28)
    const frames: FrameEvent[] = []

    liveRoot = await createRoot({
      stdout: terminal.stdout,
      stdin: terminal.stdin,
      stderr: terminal.stderr,
      exitOnCtrlC: false,
      patchConsole: false,
      onFrame: event => {
        frames.push(event)
      },
    })

    liveRoot.render(<PermissionPreviewHarness />)
    await waitFor(
      () =>
        frames.length > 0 &&
        terminal.getChunks().join('').includes('PERMISSION-PREVIEW-LINE'),
      'permission preview never rendered',
    )
    terminal.stdin.write('\r')
    await waitFor(
      () => terminal.getChunks().join('').includes('normal-footer-answered'),
      'permission preview never returned to normal after accept',
    )

    const ink = instances.get(terminal.stdout)! as unknown as MountedInkProbe
    const oracle = new TerminalReplayOracle({
      width: terminal.stdout.columns,
      height: terminal.stdout.rows,
    })
    for (const chunk of terminal.getChunks()) {
      oracle.feed(chunk)
    }

    oracle.assertScreenAt(ink.frontFrame.screen, 0)
    expect(oracle.text()).not.toContain('PERMISSION-PREVIEW-LINE')
    expect(oracle.text()).not.toContain('SECONDARY-PREVIEW-LINE')
    expect(oracle.text()).toContain('normal-footer-answered')
  })

  it('matches the final mounted screen after compact attachments mount', async () => {
    const terminal = createFakeTerminal(96, 18)
    const frames: FrameEvent[] = []
    const checkpoints: FrameReplayCheckpoint[] = []

    liveRoot = await createRoot({
      stdout: terminal.stdout,
      stdin: terminal.stdin,
      stderr: terminal.stderr,
      exitOnCtrlC: false,
      patchConsole: false,
      onFrame: event => {
        frames.push(event)
        const ink = instances.get(terminal.stdout) as
          | (MountedInkProbe & { frontFrame: { screen: Screen } })
          | undefined
        if (ink) {
          checkpoints.push({
            chunkCount: terminal.getChunks().length,
            rows: screenToRows(ink.frontFrame.screen),
          })
        }
      },
    })

    liveRoot.render(<CompactArtifactHarness showAttachments={false} preCompact />)
    await waitFor(
      () =>
        frames.length > 0 &&
        terminal
          .getChunks()
          .join('')
          .includes('ghes_server/src/main.rs'),
      'pre-compact attachments never rendered',
    )

    liveRoot.render(<CompactArtifactHarness showAttachments={false} />)
    await waitFor(
      () =>
        frames.length > 0 &&
        terminal.getChunks().join('').includes('Conversation compacted'),
      'compact boundary never rendered',
    )
    liveRoot.render(<CompactArtifactHarness showAttachments={true} />)
    await waitFor(
      () =>
        terminal
          .getChunks()
          .join('')
          .includes('eden/mononoke/servers/ghes_service/src/router.rs') ||
        terminal
          .getChunks()
          .join('')
          .includes('eden/mononoke/servers/ghes/ghes_service/src/router.rs'),
      'compact attachments never rendered',
    )

    const ink = instances.get(terminal.stdout)! as unknown as MountedInkProbe
    const oracle = new TerminalReplayOracle({
      width: terminal.stdout.columns,
      height: terminal.stdout.rows,
    })
    for (const chunk of terminal.getChunks()) {
      oracle.feed(chunk)
    }

    assertReplayCheckpoints(terminal, checkpoints)
    oracle.assertScreenAt(ink.frontFrame.screen, 0)
    const replayedTranscript = oracle.allRows().join('\n')
    expect(replayedTranscript).toContain('Conversation compacted')
    expect(replayedTranscript).toContain('eden/mononoke/servers/ghes/ghes_service/BUCK')
    expect(replayedTranscript).toContain('ghes_server/src/main.rs')
    expect(replayedTranscript).not.toContain('Conversation/compacted')
    expect(replayedTranscript).not.toContain('Conversationdcompacted')
    expect(replayedTranscript).not.toContain('Readueden')
  })
})
