import { mock } from 'bun:test'
import React from 'react'
import { PassThrough } from 'stream'
import stripAnsi from 'strip-ansi'
import type { Props as ReplProps } from '../screens/REPL.js'
import { getDefaultAppState } from '../state/AppState.js'
import {
  createAssistantMessage,
  createUserMessage,
} from '../utils/messages.js'
import type { FrameEvent } from './frame.js'
import instances from './instances.js'
import { createRoot, type Root } from './root.js'
import { cellAt, type Screen } from './screen.js'

type MacroGlobals = {
  VERSION: string
  VERSION_CHANGELOG?: string
  BUILD_TIME?: string
}

export type FakeInput = PassThrough &
  NodeJS.ReadStream & {
    isTTY: boolean
    isRaw: boolean
    setRawMode: (raw: boolean) => void
    ref: () => FakeInput
    unref: () => FakeInput
  }

export type FakeOutput = PassThrough &
  NodeJS.WriteStream & {
    isTTY: boolean
    columns: number
    rows: number
    getWindowSize: () => [number, number]
  }

export type FakeTerminal = {
  stdin: FakeInput
  stdout: FakeOutput
  stderr: FakeOutput
  clearOutput: () => void
  getOutput: () => string
}

export type MountedInkProbe = {
  frontFrame: {
    screen: Screen
  }
}

export type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

export type LargeTranscriptFixtureOptions = {
  turnCount?: number
  fileLineCount?: number
  fileLineWidth?: number
}

let mocksInstalled = false
let liveRoot: Root | null = null

export function installReplPerfEnvironment(): void {
  if (!(globalThis as { MACRO?: MacroGlobals }).MACRO) {
    ;(globalThis as { MACRO?: MacroGlobals }).MACRO = {
      VERSION: '0.0.0-test',
      VERSION_CHANGELOG: '',
      BUILD_TIME: 'test',
    }
  }

  process.env.NODE_ENV ??= 'test'

  if (mocksInstalled) {
    return
  }
  mocksInstalled = true

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
  mock.module('@ant/computer-use-mcp/types', () => ({
    DEFAULT_GRANT_FLAGS: [],
  }))
  mock.module('@ant/computer-use-mcp/sentinelApps', () => ({
    getSentinelCategory: () => null,
  }))
  mock.module('@ant/computer-use-input', () => ({}))
  mock.module('@ant/computer-use-swift', () => ({}))
}

export async function cleanupMountedRepl(): Promise<void> {
  if (liveRoot) {
    liveRoot.unmount()
    liveRoot = null
  }
  await Bun.sleep(0)
}

function createFakeInput(): FakeInput {
  const stdin = new PassThrough() as FakeInput
  stdin.isTTY = true
  stdin.isRaw = false
  stdin.setRawMode = (raw: boolean) => {
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

export function createFakeTerminal(columns = 80, rows = 24): FakeTerminal {
  let output = ''
  const stdout = createFakeOutput(columns, rows)
  const stderr = createFakeOutput(columns, rows)
  stdout.on('data', chunk => {
    output += chunk.toString()
  })
  return {
    stdin: createFakeInput(),
    stdout,
    stderr,
    clearOutput: () => {
      output = ''
    },
    getOutput: () => output,
  }
}

export async function waitFor(
  predicate: () => boolean,
  message: string,
  timeoutMs = 4000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await Bun.sleep(20)
  }
  throw new Error(message)
}

export async function writeInput(
  stdin: FakeInput,
  sequence: string,
): Promise<void> {
  stdin.write(sequence)
  await Bun.sleep(10)
}

export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
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

/**
 * The nastiest REPL perf failures do not happen on short single-line chats.
 * They happen once a long transcript also carries large rendered file/code
 * blocks, because that multiplies mounted rows, Yoga work, and retained heap.
 * Keep this fixture intentionally "file heavy" so the perf lane exercises the
 * same regime that has historically led to freezing and multi-GB RSS spikes.
 */
export function makeLargeTranscriptMessages({
  turnCount = 320,
  fileLineCount = 28,
  fileLineWidth = 72,
}: LargeTranscriptFixtureOptions = {}) {
  const messages = []
  const buildLine = (turn: number, line: number) =>
    `export const value_${turn.toString(36)}_${line
      .toString(36)
      .padStart(2, '0')} = '${`${turn}-${line}`.padEnd(fileLineWidth, 'x')}';`

  for (let i = 0; i < turnCount; i += 1) {
    const fileBody = Array.from(
      { length: fileLineCount },
      (_, line) => buildLine(i, line),
    ).join('\n')

    messages.push(
      createUserMessage({
        content: `user-${i} inspect src/file-${i}.ts and explain the regression`,
      }),
    )
    messages.push(
      createAssistantMessage({
        content: [
          `assistant-${i}`,
          '',
          `Rendered excerpt for src/file-${i}.ts:`,
          '```ts',
          `// src/file-${i}.ts`,
          fileBody,
          '```',
          '',
          `Summary ${i}: this file contributes to the long-history render stress fixture.`,
        ].join('\n'),
      }),
    )
  }

  return messages
}

export function readScreenText(screen: Screen): string {
  const rows: string[] = []
  for (let y = 0; y < screen.height; y += 1) {
    let row = ''
    for (let x = 0; x < screen.width; x += 1) {
      row += cellAt(screen, x, y)?.char ?? ' '
    }
    rows.push(row)
  }
  return rows.join('\n')
}

export function mountedScreenIncludes(
  ink: MountedInkProbe | undefined,
  text: string,
): boolean {
  return ink ? readScreenText(ink.frontFrame.screen).includes(text) : false
}

export function stripTerminalOutput(output: string): string {
  return stripAnsi(output).replace(/\s+/g, ' ').trim()
}

export function collapseWhitespace(output: string): string {
  return stripTerminalOutput(output).replace(/\s+/g, '')
}

export function normalizeTerminalText(output: string): string {
  return stripTerminalOutput(output).replace(/\s+/g, ' ').trim()
}

export function parseCounter(
  output: string,
): { current: number; total: number } | null {
  const match = stripTerminalOutput(output).match(/\b(\d+)\/(\d+)\b/)
  if (!match) return null
  return {
    current: Number.parseInt(match[1]!, 10),
    total: Number.parseInt(match[2]!, 10),
  }
}

export function readInkScreenCounter(ink: MountedInkProbe | undefined) {
  if (!ink) return null
  return parseCounter(readScreenText(ink.frontFrame.screen))
}

export function readMaxTranscriptIndex(screenText: string): number | null {
  const matches = [...screenText.matchAll(/\b(?:user|assistant)-(\d+)\b/g)]
  if (matches.length === 0) return null

  return Math.max(...matches.map(match => Number.parseInt(match[1]!, 10)))
}

export function readInkScreenMaxTranscriptIndex(
  ink: MountedInkProbe | undefined,
) {
  if (!ink) return null
  return readMaxTranscriptIndex(readScreenText(ink.frontFrame.screen))
}

export function readLongHistoryFixtureIndex(screenText: string): number | null {
  const regexes = [
    /\bSummary (\d+):/g,
    /\bsrc\/file-(\d+)\.ts\b/g,
    /\b(?:assistant|user)-(\d+)\b/g,
    /'(\d+)-\d+x+/g,
  ]

  const values = regexes.flatMap(regex =>
    [...screenText.matchAll(regex)].map(match => Number.parseInt(match[1]!, 10)),
  )

  if (values.length === 0) return null
  return Math.max(...values)
}

export function readInkScreenLongHistoryFixtureIndex(
  ink: MountedInkProbe | undefined,
) {
  if (!ink) return null
  return readLongHistoryFixtureIndex(readScreenText(ink.frontFrame.screen))
}

export async function mountRepl(
  options:
    | {
        messageCount?: number
        terminalColumns?: number
        terminalRows?: number
        replProps?: Partial<ReplProps>
      }
    | number = {},
): Promise<{
  terminal: FakeTerminal
  frames: FrameEvent[]
}> {
  installReplPerfEnvironment()

  const normalizedOptions =
    typeof options === 'number' ? { messageCount: options } : options
  const {
    messageCount = 80,
    terminalColumns = 80,
    terminalRows = 24,
    replProps,
  } = normalizedOptions

  const { App } = await import('../components/App.js')
  const { REPL } = await import('../screens/REPL.js')

  const terminal = createFakeTerminal(terminalColumns, terminalRows)
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

  liveRoot.render(
    <App getFpsMetrics={() => undefined} initialState={getDefaultAppState()}>
      <REPL
        commands={[]}
        debug={false}
        initialTools={[]}
        initialMessages={makeMessages(messageCount)}
        thinkingConfig={{ type: 'disabled' }}
        {...replProps}
      />
    </App>,
  )

  await waitFor(() => frames.length > 0, 'REPL never rendered a frame')
  const rawModeDeadline = Date.now() + 1000
  while (Date.now() < rawModeDeadline) {
    if (terminal.stdin.isRaw) {
      break
    }
    await Bun.sleep(20)
  }
  if (!terminal.stdin.isRaw) {
    const ink = getMountedInkProbe(terminal)
    const screenText = ink
      ? stripTerminalOutput(readScreenText(ink.frontFrame.screen))
      : '(no mounted ink probe)'
    throw new Error(
      `REPL never enabled raw mode on stdin. Screen: ${screenText}. Output: ${stripTerminalOutput(
        terminal.getOutput(),
      )}`,
    )
  }
  await Bun.sleep(150)

  return { terminal, frames }
}

export function getMountedInkProbe(
  terminal: FakeTerminal,
): MountedInkProbe | undefined {
  return instances.get(terminal.stdout) as MountedInkProbe | undefined
}
