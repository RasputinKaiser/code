import { afterEach, describe, expect, it } from 'bun:test'
import React from 'react'
import { type FrameEvent } from './frame.js'
import instances from './instances.js'
import { createRoot, type Root } from './root.js'
import Box from './components/Box.js'
import Text from './components/Text.js'
import { useDeclaredCursor } from './hooks/use-declared-cursor.js'
import { nodeCache } from './node-cache.js'
import type { DOMElement } from './dom.js'
import { screenToRows, TerminalReplayOracle } from './terminalReplayOracle.js'
import type { Screen } from './screen.js'

let liveRoot: Root | null = null

afterEach(async () => {
  if (liveRoot) {
    liveRoot.unmount()
    liveRoot = null
  }
  await Bun.sleep(0)
})

function createFakeInput() {
  const { PassThrough } = require('stream')
  const stdin = new PassThrough()
  stdin.isTTY = true
  stdin.isRaw = false
  stdin.setRawMode = (raw: boolean) => { stdin.isRaw = raw }
  stdin.ref = () => stdin
  stdin.unref = () => stdin
  return stdin
}

function createFakeOutput(columns: number, rows: number) {
  const { PassThrough } = require('stream')
  const stdout = new PassThrough()
  stdout.isTTY = true
  stdout.columns = columns
  stdout.rows = rows
  stdout.getWindowSize = () => [columns, rows] as [number, number]
  return stdout
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

function TallMainScreenHarness({
  suffix = '',
}: {
  suffix?: string
}): React.ReactNode {
  return (
    <Box flexDirection="column">
      {Array.from({ length: 20 }, (_, index) => (
        <Text key={index}>main-row-{index}{index === 19 ? suffix : ''}</Text>
      ))}
    </Box>
  )
}

function DeclaredCursorRow({ text }: { text: string }): React.ReactNode {
  const cursorRef = useDeclaredCursor({
    line: 0,
    column: text.length,
    active: true,
  })

  return (
    <Box ref={cursorRef}>
      <Text>{text}</Text>
    </Box>
  )
}

function TallDeclaredCursorHarness({
  suffix = '',
}: {
  suffix?: string
}): React.ReactNode {
  return (
    <Box flexDirection="column">
      {Array.from({ length: 19 }, (_, index) => (
        <Text key={index}>cursor-row-{index}</Text>
      ))}
      <DeclaredCursorRow text={`cursor-tail${suffix}`} />
    </Box>
  )
}

function VariableTallDeclaredCursorHarness({
  rowCount,
  suffix = '',
}: {
  rowCount: number
  suffix?: string
}): React.ReactNode {
  return (
    <Box flexDirection="column">
      {Array.from({ length: rowCount - 1 }, (_, index) => (
        <Text key={index}>variable-row-{index}</Text>
      ))}
      <DeclaredCursorRow text={`variable-tail${suffix}`} />
    </Box>
  )
}

type InkRecoveryInstance = {
  enterAlternateScreen: () => void
  exitAlternateScreen: () => void
  forceRedraw: (options?: { clearBeforePaint?: boolean }) => void
  handleResume: () => void
}

describe('Ink compact/repaint baseline contract', () => {
  it('PROVE: forceRedraw stores unclipped cursor baseline, desyncing physical cursor', async () => {
    const stdout = createFakeOutput(40, 6) // 6-row terminal
    const stdin = createFakeInput()
    const stderr = createFakeOutput(40, 6)
    const frames: FrameEvent[] = []

    liveRoot = await createRoot({
      stdout,
      stdin,
      stderr,
      exitOnCtrlC: false,
      patchConsole: false,
      onFrame: event => {
        frames.push(event)
      },
    })

    liveRoot.render(<TallMainScreenHarness />)

    await waitFor(
      () => instances.get(stdout) !== undefined && frames.length > 0,
      'mounted Ink root never reached the first frame',
    )

    // Access private frontFrame via type assertion
    const ink = instances.get(stdout)! as unknown as InkRecoveryInstance & {
      frontFrame: { cursor: { x: number; y: number }; screen: { height: number } }
    }

    // Wait for stable state
    await Bun.sleep(50)

    const frameCount = frames.length

    // Simulate /compact: force full repaint from home with clear
    ink.forceRedraw({ clearBeforePaint: true })

    await waitFor(
      () => frames.length > frameCount,
      'forceRedraw never produced a repaired frame',
    )

    // After a clipped repaint, the physical terminal cursor is at the bottom
    // of the VISIBLE area (~5 rows in a 6-row terminal: viewport.height - 1).
    // BUG: ink.tsx stores the ORIGINAL unclipped frame as frontFrame.
    // frontFrame.cursor.y remains the logical buffer height (~20), not the
    // clipped visible height (~5). This desyncs the next incremental diff.
    expect(ink.frontFrame.cursor.y).toBeLessThanOrEqual(5)
  })

  it('keeps the physical baseline projected after the next incremental render', async () => {
    const stdout = createFakeOutput(40, 6)
    const stdin = createFakeInput()
    const stderr = createFakeOutput(40, 6)
    const frames: FrameEvent[] = []

    liveRoot = await createRoot({
      stdout,
      stdin,
      stderr,
      exitOnCtrlC: false,
      patchConsole: false,
      onFrame: event => {
        frames.push(event)
      },
    })

    liveRoot.render(<TallMainScreenHarness />)
    await waitFor(
      () => instances.get(stdout) !== undefined && frames.length > 0,
      'mounted Ink root never reached the first frame',
    )

    const ink = instances.get(stdout)! as unknown as InkRecoveryInstance & {
      frontFrame: { cursor: { x: number; y: number }; screen: { height: number } }
    }

    await Bun.sleep(50)
    const beforeRecoveryFrames = frames.length
    ink.forceRedraw({ clearBeforePaint: true })
    await waitFor(
      () => frames.length > beforeRecoveryFrames,
      'forceRedraw never produced a repaired frame',
    )
    expect(ink.frontFrame.cursor.y).toBeLessThanOrEqual(5)

    const beforeIncrementalFrames = frames.length
    liveRoot.render(<TallMainScreenHarness suffix="-changed" />)
    await waitFor(
      () => frames.length > beforeIncrementalFrames,
      'post-recovery incremental render never happened',
    )

    expect(ink.frontFrame.cursor.y).toBeLessThanOrEqual(5)
    expect(ink.frontFrame.screen.height).toBeLessThanOrEqual(5)
  })

  it('stores declared cursor at logical coordinates after main-screen projection', async () => {
    const stdout = createFakeOutput(40, 6)
    const stdin = createFakeInput()
    const stderr = createFakeOutput(40, 6)
    const frames: FrameEvent[] = []

    liveRoot = await createRoot({
      stdout,
      stdin,
      stderr,
      exitOnCtrlC: false,
      patchConsole: false,
      onFrame: event => {
        frames.push(event)
      },
    })

    liveRoot.render(<TallDeclaredCursorHarness />)
    await waitFor(
      () => instances.get(stdout) !== undefined && frames.length > 0,
      'mounted Ink root never reached the first frame',
    )

    const ink = instances.get(stdout)! as unknown as {
      displayCursor: { x: number; y: number } | null
      frontFrame: { screen: { height: number } }
    }

    ink.onRender()

    await waitFor(
      () => ink.displayCursor !== null,
      'declared cursor was never parked',
    )

    expect(ink.frontFrame.screen.height).toBeLessThanOrEqual(5)
    // displayCursor tracks the LOGICAL cursor position; the actual terminal
    // cursor is moved via physical offsets computed inside onRender. The
    // logical target for a cursor at row 19 in a 20-row logical frame is 19.
    expect(ink.displayCursor!.y).toBe(19)

    const beforeIncrementalFrames = frames.length
    liveRoot.render(<TallDeclaredCursorHarness suffix="-changed" />)
    await waitFor(
      () => frames.length > beforeIncrementalFrames,
      'declared-cursor incremental render never happened',
    )

    expect(ink.displayCursor!.y).toBe(19)
  })

  it('does not emit wild cursor moves on tall main screen with declared cursor', async () => {
    const stdout = createFakeOutput(40, 6)
    const stdin = createFakeInput()
    const stderr = createFakeOutput(40, 6)
    const frames: FrameEvent[] = []
    const chunks: Buffer[] = []

    liveRoot = await createRoot({
      stdout,
      stdin,
      stderr,
      exitOnCtrlC: false,
      patchConsole: false,
      onFrame: event => {
        frames.push(event)
      },
    })

    stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })

    liveRoot.render(<TallMainScreenHarness />)
    await waitFor(
      () => instances.get(stdout) !== undefined && frames.length > 0,
      'mounted Ink root never reached the first frame',
    )
    await Bun.sleep(50)

    const ink = instances.get(stdout)! as unknown as {
      onRender: () => void
      cursorDeclaration: { node: DOMElement; relativeX: number; relativeY: number } | null
    }

    // Simulate a declared cursor at the bottom of a tall logical frame
    const fakeNode = { nodeName: 'ink-box' } as unknown as DOMElement
    nodeCache.set(fakeNode, { x: 0, y: 19, width: 1, height: 1 })
    ink.cursorDeclaration = { node: fakeNode, relativeX: 0, relativeY: 0 }

    chunks.length = 0
    ink.onRender()

    const output = Buffer.concat(chunks).toString()
    // In a 6-row terminal the maximum valid downward cursor move is 5 rows.
    // Any ESC[{n}B with n >= 6 is a physical/logical coordinate desync bug.
    const wildMoves = output.match(/\u001b\[([6-9]|\d{2,})B/g)
    expect(wildMoves).toBeNull()
  })

  it('black-box: tall main screen with declared cursor stays incremental and matches oracle', async () => {
    const stdout = createFakeOutput(40, 6)
    const stdin = createFakeInput()
    const stderr = createFakeOutput(40, 6)
    const frames: FrameEvent[] = []
    const chunks: Buffer[] = []

    liveRoot = await createRoot({
      stdout,
      stdin,
      stderr,
      exitOnCtrlC: false,
      patchConsole: false,
      onFrame: event => {
        frames.push(event)
      },
    })

    stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })

    liveRoot.render(<TallDeclaredCursorHarness />)

    await waitFor(
      () => instances.get(stdout) !== undefined && frames.length > 0,
      'mounted Ink root never reached the first frame',
    )

    // Ensure a complete render cycle so the declared cursor is registered
    const ink = instances.get(stdout)! as unknown as {
      onRender: () => void
      displayCursor: { x: number; y: number } | null
    }
    ink.onRender()

    await waitFor(
      () => ink.displayCursor !== null,
      'declared cursor was never parked',
    )

    // Remember how many chunks the initial mount produced.
    const mountChunkCount = chunks.length

    const beforeIncrementalFrames = frames.length
    liveRoot.render(<TallDeclaredCursorHarness suffix="-changed" />)

    await waitFor(
      () => frames.length > beforeIncrementalFrames,
      'incremental render never happened',
    )

    const incrementalChunks = chunks.slice(mountChunkCount)
    const output = Buffer.concat(incrementalChunks).toString()

    // In a 6-row terminal the maximum valid downward cursor move per frame is 5 rows.
    // Any ESC[{n}B with n >= 6 is a physical/logical coordinate desync bug.
    const wildMoves = output.match(/\u001b\[([6-9]|\d{2,})B/g)
    expect(wildMoves).toBeNull()

    // Replay ALL chunks (mount + incremental) through the terminal oracle.
    // The oracle needs the full sequence to reconstruct the final visible state.
    const oracle = new TerminalReplayOracle({ width: 40, height: 6 })
    for (const chunk of chunks) {
      oracle.feed(chunk.toString())
    }

    // Assert the oracle's visible screen matches the committed frontFrame
    const inkWithScreen = instances.get(stdout) as unknown as {
      frontFrame: { screen: Screen }
    }
    oracle.assertMatchesScreen(inkWithScreen.frontFrame.screen)

    // Assert the incremental frame was actually incremental
    const lastFrame = frames[frames.length - 1]
    expect(lastFrame.flickers).toHaveLength(0)
    expect(lastFrame.phases!.patches).toBeLessThan(20)
    expect(lastFrame.phases!.bytes).toBeLessThan(2000)
  })

  it('black-box: declared cursor stays aligned when logical scrollback height changes', async () => {
    const stdout = createFakeOutput(40, 6)
    const stdin = createFakeInput()
    const stderr = createFakeOutput(40, 6)
    const frames: FrameEvent[] = []
    const chunks: Buffer[] = []

    liveRoot = await createRoot({
      stdout,
      stdin,
      stderr,
      exitOnCtrlC: false,
      patchConsole: false,
      onFrame: event => {
        frames.push(event)
      },
    })

    stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })

    liveRoot.render(<VariableTallDeclaredCursorHarness rowCount={20} />)

    await waitFor(
      () => instances.get(stdout) !== undefined && frames.length > 0,
      'mounted Ink root never reached the first frame',
    )

    const ink = instances.get(stdout)! as unknown as {
      onRender: () => void
      displayCursor: { x: number; y: number } | null
    }

    ink.onRender()

    await waitFor(
      () => ink.displayCursor !== null,
      'declared cursor was never parked',
    )

    const beforeIncrementalFrames = frames.length
    liveRoot.render(
      <VariableTallDeclaredCursorHarness rowCount={21} suffix="-changed" />,
    )

    await waitFor(
      () => frames.length > beforeIncrementalFrames,
      'height-changing incremental render never happened',
    )

    const oracle = new TerminalReplayOracle({ width: 40, height: 6 })
    for (const chunk of chunks) {
      oracle.feed(chunk.toString())
    }

    const inkWithScreen = instances.get(stdout) as unknown as {
      frontFrame: { screen: Screen }
    }
    oracle.assertMatchesScreen(inkWithScreen.frontFrame.screen)
  })

})
