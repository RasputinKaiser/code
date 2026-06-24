import { mock } from 'bun:test'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import React from 'react'
import type { FrameEvent } from '../ink/frame.js'
import { createAssistantMessage, createUserMessage } from '../utils/messages.js'
import type { ReplPtyFixtureScenario } from './replPtyFixtureHarness.js'

;(globalThis as {
  MACRO?: { VERSION: string; VERSION_CHANGELOG?: string; BUILD_TIME?: string }
}).MACRO = {
  VERSION: '0.0.0-test',
  VERSION_CHANGELOG: '',
  BUILD_TIME: 'test',
}

process.env.ANTHROPIC_API_KEY ??= 'test-key'
process.env.CLAUDE_CODE_NO_FLICKER ??= '1'
process.env.NODE_ENV = 'test'

mock.module('@ant/claude-for-chrome-mcp', () => ({
  BROWSER_TOOLS: [],
  createClaudeForChromeMcpServer: () => ({ connect: async () => {} }),
}))
mock.module('@ant/computer-use-mcp', () => ({
  buildComputerUseTools: () => [],
  bindSessionContext: () => {},
  DEFAULT_GRANT_FLAGS: [],
  API_RESIZE_PARAMS: {},
  targetImageSize: () => ({ width: 0, height: 0 }),
}))
mock.module('@ant/computer-use-mcp/types', () => ({ DEFAULT_GRANT_FLAGS: [] }))
mock.module('@ant/computer-use-mcp/sentinelApps', () => ({
  getSentinelCategory: () => null,
}))
mock.module('@ant/computer-use-input', () => ({}))
mock.module('@ant/computer-use-swift', () => ({}))

type LoggedFrameEvent = {
  readonly bytes: number
  readonly yogaMeasured: number
  readonly yogaVisited: number
  readonly flickers: number
}

function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true })
}

function appendFrame(frameLogPath: string, event: FrameEvent): void {
  const summary: LoggedFrameEvent = {
    bytes: event.phases?.bytes ?? 0,
    yogaMeasured: event.phases?.yogaMeasured ?? 0,
    yogaVisited: event.phases?.yogaVisited ?? 0,
    flickers: event.flickers.length,
  }
  appendFileSync(frameLogPath, `${JSON.stringify(summary)}\n`)
}

function appendRawOutput(rawOutputPath: string, chunk: unknown): void {
  if (typeof chunk === 'string') {
    appendFileSync(rawOutputPath, chunk)
    return
  }

  if (chunk instanceof Uint8Array) {
    appendFileSync(rawOutputPath, chunk)
    return
  }

  appendFileSync(rawOutputPath, String(chunk))
}

function makeMessages(count: number) {
  const messages = []
  for (let i = 0; i < count; i += 1) {
    messages.push(
      createUserMessage({ content: `user-${i} ${'x'.repeat(40)}` }),
    )
    messages.push(
      createAssistantMessage({ content: `assistant-${i} ${'y'.repeat(80)}` }),
    )
  }
  return messages
}

function buildScenarioMessages(scenario: ReplPtyFixtureScenario | null) {
  if (!scenario?.initialMessages || scenario.initialMessages.length === 0) {
    return makeMessages(80)
  }

  return scenario.initialMessages.map(message => {
    if (message.role === 'user' && 'content' in message) {
      return createUserMessage({ content: message.content })
    }

    if (message.role === 'assistant' && 'content' in message) {
      return createAssistantMessage({ content: message.content })
    }

    if (message.role === 'assistant' && 'toolUse' in message) {
      return createAssistantMessage({
        content: [
          {
            type: 'tool_use' as const,
            id: message.toolUse.id,
            name: message.toolUse.name,
            input: message.toolUse.input,
          },
        ],
      })
    }

    if (message.role === 'user' && 'toolResult' in message) {
      return createUserMessage({
        content: [
          {
            type: 'tool_result' as const,
            tool_use_id: message.toolResult.toolUseId,
            content: message.toolResult.content,
            ...(message.toolResult.isError ? { is_error: true } : {}),
          },
        ],
        toolUseResult: message.toolResult.toolUseResult,
      })
    }

    throw new Error(`Unsupported PTY fixture message: ${JSON.stringify(message)}`)
  })
}

async function main(): Promise<void> {
  const readyPath = process.argv[2]
  const frameLogPath = process.argv[3]
  const rawOutputPath = process.argv[4]
  const scenarioPath = process.argv[5]

  if (!readyPath || !frameLogPath || !rawOutputPath) {
    throw new Error(
      'Usage: replTmuxFixture.tsx <ready-path> <frame-log-path> <raw-output-path> [scenario-path]',
    )
  }

  ensureParent(readyPath)
  ensureParent(frameLogPath)
  ensureParent(rawOutputPath)
  writeFileSync(frameLogPath, '')
  writeFileSync(rawOutputPath, '')

  const originalWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: unknown, ...args: unknown[]) => {
    appendRawOutput(rawOutputPath, chunk)
    return originalWrite(chunk as never, ...(args as never[]))
  }) as typeof process.stdout.write

  const { createRoot } = await import('../ink/root.js')
  const { App } = await import('../components/App.js')
  const { REPL } = await import('../screens/REPL.js')
  const { getDefaultAppState } = await import('../state/AppState.js')
  const scenario = scenarioPath
    ? (JSON.parse(
        readFileSync(scenarioPath, 'utf8'),
      ) as ReplPtyFixtureScenario)
    : null

  let wroteReady = false
  const root = await createRoot({
    stdout: process.stdout,
    stdin: process.stdin,
    stderr: process.stderr,
    exitOnCtrlC: false,
    patchConsole: false,
    onFrame: event => {
      appendFrame(frameLogPath, event)
      if (!wroteReady) {
        wroteReady = true
        writeFileSync(readyPath, 'ready')
      }
    },
  })

  root.render(
    <App getFpsMetrics={() => undefined} initialState={getDefaultAppState()}>
      <REPL
        commands={[]}
        debug={false}
        initialTools={[]}
        initialMessages={buildScenarioMessages(scenario)}
        thinkingConfig={{ type: 'disabled' }}
      />
    </App>,
  )

  await new Promise<void>(() => {})
}

await main()
