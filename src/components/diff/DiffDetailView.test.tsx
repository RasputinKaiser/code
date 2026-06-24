import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import React from 'react'
import { PassThrough } from 'stream'
import stripAnsi from 'strip-ansi'
import { createRoot, type Root } from '../../ink/root.js'

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
  getOutput: () => string
}

const readFileSafeCalls: string[] = []

const fileModulePaths = [
  import.meta.resolve('../../utils/file.ts'),
  import.meta.resolve('../../utils/file.js'),
]

const actualFileModule = await import(import.meta.resolve('../../utils/file.ts'))

for (const fileModulePath of fileModulePaths) {
  mock.module(fileModulePath, () => ({
    ...actualFileModule,
    readFileSafe: (filepath: string) => {
      readFileSafeCalls.push(filepath)
      return 'first line\nsecond line'
    },
  }))
}

const { DiffDetailView } = await import(import.meta.resolve('./DiffDetailView.tsx'))

for (const fileModulePath of fileModulePaths) {
  mock.module(fileModulePath, () => actualFileModule)
}

let liveRoot: Root | null = null

beforeEach(() => {
  readFileSafeCalls.length = 0
})

afterEach(async () => {
  if (liveRoot) {
    liveRoot.unmount()
    liveRoot = null
  }
  await Bun.sleep(0)
  readFileSafeCalls.length = 0
})

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

function createFakeTerminal(columns = 80, rows = 20): FakeTerminal {
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
    getOutput: () => output,
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

async function renderDiffDetail(props: React.ComponentProps<typeof DiffDetailView>) {
  const terminal = createFakeTerminal()
  liveRoot = await createRoot({
    stdout: terminal.stdout,
    stdin: terminal.stdin,
    stderr: terminal.stderr,
    exitOnCtrlC: false,
    patchConsole: false,
  })
  liveRoot.render(<DiffDetailView {...props} />)
  await waitFor(
    () => terminal.getOutput().length > 0,
    'DiffDetailView never produced output',
  )
  return terminal
}

function normalizeTerminalOutput(output: string): string {
  return stripAnsi(output).replace(/\s+/g, '').trim()
}

describe('DiffDetailView large-file guard contracts', () => {
  it('does not read file content for large-file placeholder branches', async () => {
    const terminal = await renderDiffDetail({
      filePath: 'large.ts',
      hunks: [],
      isLargeFile: true,
    })

    expect(readFileSafeCalls).toHaveLength(0)
    expect(normalizeTerminalOutput(terminal.getOutput())).toContain(
      'Largefile-diffexceeds1MBlimit',
    )
  })

  it('does not read file content for binary placeholder branches', async () => {
    const terminal = await renderDiffDetail({
      filePath: 'binary.dat',
      hunks: [],
      isBinary: true,
    })

    expect(readFileSafeCalls).toHaveLength(0)
    expect(normalizeTerminalOutput(terminal.getOutput())).toContain(
      'Binaryfile-cannotdisplaydiff',
    )
  })

  it('does not read file content when there are no hunks to render', async () => {
    await renderDiffDetail({
      filePath: 'normal.ts',
      hunks: [],
    })

    expect(readFileSafeCalls).toHaveLength(0)
  })

  it('still reads file content when a real diff body needs file content', async () => {
    await renderDiffDetail({
      filePath: 'normal.ts',
      hunks: [
        {
          oldStart: 1,
          oldLines: 1,
          newStart: 1,
          newLines: 1,
          lines: ['-old value', '+new value'],
        },
      ],
    })

    expect(readFileSafeCalls.length).toBeGreaterThan(0)
  })
})
