import { afterEach, describe, expect, it } from 'bun:test'
import React, { createRef } from 'react'
import { PassThrough } from 'stream'
import { ScrollKeybindingHandler } from '../components/ScrollKeybindingHandler.js'
import { KeybindingSetup } from '../keybindings/KeybindingProviderSetup.js'
import { AppStateProvider, getDefaultAppState } from '../state/AppState.js'
import { type FrameEvent } from './frame.js'
import instances from './instances.js'
import { createRoot, type Root } from './root.js'
import { AlternateScreen } from './components/AlternateScreen.js'
import Box from './components/Box.js'
import ScrollBox, { type ScrollBoxHandle } from './components/ScrollBox.js'
import Text from './components/Text.js'

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
  clearOutput: () => void
  getOutput: () => string
}

type FrameBudget = {
  maxPatches: number
  maxBytes: number
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

function createFakeTerminal(columns = 40, rows = 12): FakeTerminal {
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

function expectFramesWithinBudget(
  frames: FrameEvent[],
  budget: FrameBudget,
  label: string,
): void {
  const measuredFrames = frames.filter(
    frame => frame.phases !== undefined && frame.phases.bytes > 0,
  )
  expect(measuredFrames.length).toBeGreaterThan(0)

  const maxPatches = Math.max(
    ...measuredFrames.map(frame => frame.phases?.patches ?? 0),
  )
  const maxBytes = Math.max(
    ...measuredFrames.map(frame => frame.phases?.bytes ?? 0),
  )

  if (maxPatches > budget.maxPatches) {
    throw new Error(
      `${label} exceeded the mounted repaint patch budget: ${maxPatches} > ${budget.maxPatches}`,
    )
  }

  if (maxBytes > budget.maxBytes) {
    throw new Error(
      `${label} exceeded the mounted repaint byte budget: ${maxBytes} > ${budget.maxBytes}`,
    )
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

function sgrMouse(
  button: number,
  col: number,
  row: number,
  action: 'press' | 'release',
): string {
  return `\u001b[<${button};${col};${row}${action === 'press' ? 'M' : 'm'}`
}

function sgrWheel(
  direction: 'up' | 'down',
  col: number,
  row: number,
): string {
  return sgrMouse(direction === 'up' ? 64 : 65, col, row, 'press')
}

async function writeInput(stdin: FakeInput, sequence: string): Promise<void> {
  stdin.write(sequence)
  await Bun.sleep(5)
}

function SelectionAutoscrollHarness({
  scrollRef,
}: {
  scrollRef: React.RefObject<ScrollBoxHandle | null>
}): React.ReactNode {
  const transcript = Array.from(
    { length: 40 },
    (_, index) => `line-${String(index).padStart(2, '0')}`,
  ).join('\n')

  return (
    <AppStateProvider initialState={getDefaultAppState()}>
      <KeybindingSetup>
        <AlternateScreen mouseTracking={true}>
          <Box flexDirection="column" height="100%" width="100%">
            <ScrollBox
              ref={scrollRef}
              height={8}
              width="100%"
              flexDirection="column"
            >
              <Box height={40} width="100%" flexShrink={0}>
                <Text>{transcript}</Text>
              </Box>
            </ScrollBox>
            <Box height={4} width="100%" flexDirection="column">
              <Text>footer-0</Text>
              <Text>footer-1</Text>
              <Text>footer-2</Text>
              <Text>footer-3</Text>
            </Box>
            <ScrollKeybindingHandler scrollRef={scrollRef} isActive={true} />
          </Box>
        </AlternateScreen>
      </KeybindingSetup>
    </AppStateProvider>
  )
}

describe('mounted drag autoscroll flicker regression', () => {
  it('autoscrolls a drag selection without emitting flicker frames or destructive clears', async () => {
    const terminal = createFakeTerminal()
    const frames: FrameEvent[] = []
    const scrollRef = createRef<ScrollBoxHandle | null>()

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

    liveRoot.render(<SelectionAutoscrollHarness scrollRef={scrollRef} />)

    await waitFor(
      () =>
        scrollRef.current !== null &&
        scrollRef.current.getViewportHeight() > 0 &&
        scrollRef.current.getFreshScrollHeight() >
          scrollRef.current.getViewportHeight(),
      'mounted Ink root never reached interactive selection state',
    )

    const scroll = scrollRef.current!
    const ink = instances.get(terminal.stdout)
    expect(ink).toBeDefined()
    expect(scroll.getFreshScrollHeight()).toBeGreaterThan(
      scroll.getViewportHeight(),
    )
    await Bun.sleep(25)
    const viewportTop = scroll.getViewportTop()
    const viewportHeight = scroll.getViewportHeight()
    const viewportBottom = viewportTop + viewportHeight - 1
    const anchorRow = viewportTop + 1
    const footerRow = Math.min(terminal.stdout.rows - 1, viewportBottom + 2)

    expect(footerRow).toBeGreaterThan(viewportBottom)

    terminal.clearOutput()
    const frameStart = frames.length

    await writeInput(
      terminal.stdin,
      sgrMouse(0, 2, anchorRow + 1, 'press'),
    )
    await waitFor(
      () => ink!.selection.anchor?.row === anchorRow && ink!.selection.isDragging,
      'mouse press never started a text selection',
    )
    await writeInput(
      terminal.stdin,
      sgrMouse(32, 2, footerRow + 1, 'press'),
    )
    await waitFor(
      () => ink!.selection.focus?.row === footerRow,
      'mouse drag never moved the selection focus below the viewport',
    )

    await waitFor(
      () => scroll.getScrollTop() > 0,
      'drag selection never autoscrolled the ScrollBox',
    )

    await Bun.sleep(180)

    const dragFrames = frames.slice(frameStart)
    expect(dragFrames.length).toBeGreaterThan(0)
    expect(dragFrames.every(frame => frame.flickers.length === 0)).toBe(true)

    const output = terminal.getOutput()
    expect(output.includes('\u001b[2J')).toBe(false)
    expect(output.includes('\u001b[3J')).toBe(false)
  })

  it('wheel-scrolls a long transcript without emitting flicker frames or destructive clears', async () => {
    const terminal = createFakeTerminal()
    const frames: FrameEvent[] = []
    const scrollRef = createRef<ScrollBoxHandle | null>()

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

    liveRoot.render(<SelectionAutoscrollHarness scrollRef={scrollRef} />)

    await waitFor(
      () =>
        scrollRef.current !== null &&
        scrollRef.current.getViewportHeight() > 0 &&
        scrollRef.current.getFreshScrollHeight() >
          scrollRef.current.getViewportHeight(),
      'mounted Ink root never produced a scrollable transcript',
    )

    const scroll = scrollRef.current!
    const initialScrollTop = scroll.getScrollTop()
    const wheelRow = scroll.getViewportTop() + 2

    terminal.clearOutput()
    const frameStart = frames.length

    for (let i = 0; i < 8; i += 1) {
      await writeInput(terminal.stdin, sgrWheel('down', 2, wheelRow + 1))
      await Bun.sleep(20)
    }

    await waitFor(
      () => scroll.getScrollTop() > initialScrollTop,
      'wheel scroll never moved the ScrollBox',
    )

    await Bun.sleep(180)

    const wheelFrames = frames.slice(frameStart)
    expect(wheelFrames.length).toBeGreaterThan(0)
    expect(wheelFrames.every(frame => frame.flickers.length === 0)).toBe(true)
    expectFramesWithinBudget(wheelFrames, {
      maxPatches: 220,
      maxBytes: 2800,
    }, 'wheel scroll')

    const output = terminal.getOutput()
    expect(output.includes('\u001b[2J')).toBe(false)
    expect(output.includes('\u001b[3J')).toBe(false)
  })

  it('keeps search highlight scrolling free of flicker frames and destructive clears', async () => {
    const terminal = createFakeTerminal()
    const frames: FrameEvent[] = []
    const scrollRef = createRef<ScrollBoxHandle | null>()

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

    liveRoot.render(<SelectionAutoscrollHarness scrollRef={scrollRef} />)

    await waitFor(
      () =>
        scrollRef.current !== null &&
        scrollRef.current.getViewportHeight() > 0 &&
        scrollRef.current.getFreshScrollHeight() >
          scrollRef.current.getViewportHeight(),
      'mounted Ink root never produced a scrollable transcript',
    )

    const scroll = scrollRef.current!
    const ink = instances.get(terminal.stdout)
    expect(ink).toBeDefined()

    terminal.clearOutput()
    const searchFrameStart = frames.length
    ink!.setSearchHighlight('line-0')

    await waitFor(
      () =>
        frames.length > searchFrameStart &&
        terminal.getOutput().includes('\u001b[7m'),
      'search highlight never rendered visible inverse output',
    )

    const initialScrollTop = scroll.getScrollTop()
    const wheelRow = scroll.getViewportTop() + 2

    terminal.clearOutput()
    const wheelFrameStart = frames.length

    for (let i = 0; i < 8; i += 1) {
      await writeInput(terminal.stdin, sgrWheel('down', 2, wheelRow + 1))
      await Bun.sleep(20)
    }

    await waitFor(
      () => scroll.getScrollTop() > initialScrollTop,
      'wheel scroll with search active never moved the ScrollBox',
    )

    await Bun.sleep(180)

    const wheelFrames = frames.slice(wheelFrameStart)
    expect(wheelFrames.length).toBeGreaterThan(0)
    expect(wheelFrames.every(frame => frame.flickers.length === 0)).toBe(true)
    expectFramesWithinBudget(wheelFrames, {
      maxPatches: 360,
      maxBytes: 4200,
    }, 'search-highlight wheel scroll')

    const output = terminal.getOutput()
    expect(output.includes('\u001b[2J')).toBe(false)
    expect(output.includes('\u001b[3J')).toBe(false)
  })

  it('keeps positioned current-match navigation free of flicker frames and destructive clears', async () => {
    const terminal = createFakeTerminal()
    const frames: FrameEvent[] = []
    const scrollRef = createRef<ScrollBoxHandle | null>()

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

    liveRoot.render(<SelectionAutoscrollHarness scrollRef={scrollRef} />)

    await waitFor(
      () =>
        scrollRef.current !== null &&
        scrollRef.current.getViewportHeight() > 0 &&
        scrollRef.current.getFreshScrollHeight() >
          scrollRef.current.getViewportHeight(),
      'mounted Ink root never produced a scrollable transcript',
    )

    const ink = instances.get(terminal.stdout)
    expect(ink).toBeDefined()

    terminal.clearOutput()
    ink!.setSearchHighlight('line-0')

    await waitFor(
      () => /\u001b\[[0-9;]*7m/.test(terminal.getOutput()),
      'search highlight never rendered inverse output for the current-match test',
    )

    const positions = Array.from({ length: 8 }, (_, row) => ({
      row,
      col: 0,
      len: 6,
    }))

    terminal.clearOutput()
    const frameStart = frames.length

    ink!.setSearchPositions({
      positions,
      rowOffset: 0,
      currentIdx: 0,
    })

    await waitFor(
      () =>
        frames.length > frameStart &&
        /\u001b\[[0-9;]*4m/.test(terminal.getOutput()),
      'current-match highlight never rendered underline output',
    )

    terminal.clearOutput()
    const navigationFrameStart = frames.length

    ink!.setSearchPositions({
      positions,
      rowOffset: 0,
      currentIdx: 1,
    })

    await waitFor(
      () =>
        frames.length > navigationFrameStart &&
        /\u001b\[[0-9;]*4m/.test(terminal.getOutput()),
      'current-match navigation never re-rendered underline output',
    )

    const navigationFrames = frames.slice(frameStart)
    expect(navigationFrames.length).toBeGreaterThan(0)
    expect(
      navigationFrames.every(frame => frame.flickers.length === 0),
    ).toBe(true)
    expectFramesWithinBudget(navigationFrames, {
      maxPatches: 260,
      maxBytes: 2600,
    }, 'current-match navigation')

    const output = terminal.getOutput()
    expect(output.includes('\u001b[2J')).toBe(false)
    expect(output.includes('\u001b[3J')).toBe(false)
  })
})
