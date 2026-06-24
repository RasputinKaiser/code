import { afterEach, describe, expect, it } from 'bun:test'
import React, { useMemo } from 'react'
import { PassThrough } from 'stream'
import stripAnsi from 'strip-ansi'
import { Box, Text } from '../ink.js'
import { createRoot, type Root } from '../ink/root.js'
import {
  PromptOverlayProvider,
  usePromptOverlayDialog,
  useSetPromptOverlayDialog,
} from './promptOverlayContext.js'

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

let liveRoot: Root | null = null
const originalNodeEnv = process.env.NODE_ENV

afterEach(async () => {
  if (liveRoot) {
    liveRoot.unmount()
    liveRoot = null
  }
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = originalNodeEnv
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

function createFakeOutput(columns = 80, rows = 24): FakeOutput {
  const stdout = new PassThrough() as FakeOutput
  stdout.isTTY = true
  stdout.columns = columns
  stdout.rows = rows
  stdout.getWindowSize = () => [columns, rows]
  return stdout
}

function captureWrites(stdout: FakeOutput): string[] {
  const chunks: string[] = []
  const write = stdout.write.bind(stdout)
  stdout.write = ((chunk: unknown, ...args: unknown[]) => {
    chunks.push(String(chunk))
    return write(chunk as never, ...(args as []))
  }) as FakeOutput['write']
  return chunks
}

async function waitFor(
  predicate: () => boolean,
  message: string,
  timeoutMs = 500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await Bun.sleep(5)
  }
  throw new Error(message)
}

function DialogWriter({ show }: { show: boolean }): React.ReactNode {
  const dialog = useMemo(
    () => (show ? <Text>PREVIEW-DIALOG-LONG</Text> : null),
    [show],
  )
  useSetPromptOverlayDialog(dialog)
  return null
}

function DialogPortal(): React.ReactNode {
  const dialog = usePromptOverlayDialog()
  return (
    <Box flexDirection="column">
      <Text>BASE-PROMPT-LINE</Text>
      {dialog}
    </Box>
  )
}

function Harness({ show }: { show: boolean }): React.ReactNode {
  return (
    <PromptOverlayProvider>
      <DialogWriter show={show} />
      <DialogPortal />
    </PromptOverlayProvider>
  )
}

describe('PromptOverlayProvider', () => {
  it('registers prompt dialogs before the first production paint', async () => {
    process.env.NODE_ENV = 'production'
    const stdin = createFakeInput()
    const stdout = createFakeOutput()
    const stderr = createFakeOutput()
    const chunks = captureWrites(stdout)

    liveRoot = await createRoot({
      stdout,
      stdin,
      stderr,
      exitOnCtrlC: false,
      patchConsole: false,
    })

    liveRoot.render(<Harness show={true} />)

    await waitFor(
      () => chunks.some(chunk => stripAnsi(chunk).includes('BASE-PROMPT-LINE')),
      'base prompt frame never rendered',
    )

    const contentFrames = chunks
      .map(chunk => stripAnsi(chunk))
      .filter(
        chunk =>
          chunk.includes('BASE-PROMPT-LINE') ||
          chunk.includes('PREVIEW-DIALOG-LONG'),
      )

    expect(contentFrames[0]).toContain('BASE-PROMPT-LINE')
    expect(contentFrames[0]).toContain('PREVIEW-DIALOG-LONG')
  })
})
