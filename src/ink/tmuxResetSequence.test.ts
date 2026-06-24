import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getResetSequenceForReason } from './clearTerminal.js'
import type { Diff, Frame } from './frame.js'
import { LogUpdate } from './log-update.js'
import type { Terminal } from './terminal.js'
import { writeDiffToTerminal } from './terminal.js'
import { CURSOR_HOME, ERASE_SCREEN } from './termio/csi.js'
import { ENTER_ALT_SCREEN } from './termio/dec.js'
import {
  CellWidth,
  CharPool,
  createScreen,
  HyperlinkPool,
  setCellAt,
  StylePool,
} from './screen.js'
import {
  capturePane,
  createIsolatedTmuxSession,
  destroyIsolatedTmuxSession,
  isTmuxAvailableForTests,
  shellQuote,
  type IsolatedTmuxSession,
} from '../testing/tmuxHarness.js'

const tmuxIt = isTmuxAvailableForTests() ? it : it.skip
const liveSessions: IsolatedTmuxSession[] = []
const stylePool = new StylePool()
const charPool = new CharPool()
const hyperlinkPool = new HyperlinkPool()

afterEach(() => {
  while (liveSessions.length > 0) {
    destroyIsolatedTmuxSession(liveSessions.pop()!)
  }
})

function buildResetScript(sequencePath: string): string {
  return (
    `bash -lc '` +
    `i=1; ` +
    `while [ "$i" -le 40 ]; do printf "L%02d\\n" "$i"; i=$((i+1)); done; ` +
    `cat ${shellQuote(sequencePath)}; ` +
    `sleep 5` +
    `'`
  )
}

function withTmuxSerializationEnv<T>(fn: () => T): T {
  const previousTmux = process.env.TMUX
  process.env.TMUX = '/tmp/tmux-test/default,1,0'
  try {
    return fn()
  } finally {
    if (previousTmux === undefined) {
      delete process.env.TMUX
    } else {
      process.env.TMUX = previousTmux
    }
  }
}

function serializeDiff(diff: Diff | { diff: Diff }): string {
  const patches = Array.isArray(diff) ? diff : diff.diff
  let written = ''
  const terminal = {
    stdout: {
      write(chunk: string) {
        written += chunk
        return true
      },
    },
    stderr: {
      write() {
        return true
      },
    },
  } as unknown as Terminal

  withTmuxSerializationEnv(() => {
    writeDiffToTerminal(terminal, patches)
  })
  return written
}

function makeFrame({
  lines,
  viewportWidth = 10,
  viewportHeight,
  screenHeight = lines.length,
  cursorY = screenHeight,
}: {
  lines: string[]
  viewportWidth?: number
  viewportHeight: number
  screenHeight?: number
  cursorY?: number
}): Frame {
  const screen = createScreen(
    viewportWidth,
    screenHeight,
    stylePool,
    charPool,
    hyperlinkPool,
  )

  for (let y = 0; y < lines.length; y += 1) {
    const line = lines[y] ?? ''
    for (let x = 0; x < line.length; x += 1) {
      setCellAt(screen, x, y, {
        char: line[x]!,
        styleId: stylePool.none,
        width: CellWidth.Narrow,
        hyperlink: undefined,
      })
    }
  }

  return {
    screen,
    viewport: {
      width: viewportWidth,
      height: viewportHeight,
    },
    cursor: {
      x: 0,
      y: cursorY,
      visible: true,
    },
  }
}

async function runResetCapture(
  reason: 'resize' | 'offscreen',
): Promise<string> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'code-tmux-reset-'))
  try {
    const sequencePath = join(tmpDir, `${reason}.seq`)
    writeFileSync(sequencePath, getResetSequenceForReason(reason))

    const session = createIsolatedTmuxSession({
      command: buildResetScript(sequencePath),
      width: 80,
      height: 10,
    })
    liveSessions.push(session)

    await Bun.sleep(200)
    return capturePane(session, { startLine: -50 })
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

async function runRenderedDiffCapture(diff: Diff, name: string): Promise<string> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'code-tmux-rendered-reset-'))
  try {
    const sequencePath = join(tmpDir, `${name}.seq`)
    writeFileSync(sequencePath, serializeDiff(diff))

    const session = createIsolatedTmuxSession({
      command: buildResetScript(sequencePath),
      width: 80,
      height: 10,
    })
    liveSessions.push(session)

    await Bun.sleep(200)
    return capturePane(session, { startLine: -80 })
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

async function waitForFile(path: string, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (existsSync(path)) {
      return
    }
    await Bun.sleep(10)
  }
  throw new Error(`Timed out waiting for ${path}`)
}

function splitAfterFirstRenderedRow(serializedDiff: string): [string, string] {
  const rowBreak = serializedDiff.indexOf('\r\n')
  if (rowBreak === -1) {
    throw new Error('Expected a multi-row rendered diff')
  }
  const splitIndex = rowBreak + 2
  return [serializedDiff.slice(0, splitIndex), serializedDiff.slice(splitIndex)]
}

function splitAfterPrefix(
  serializedDiff: string,
  prefix: string,
): [string, string] {
  if (!serializedDiff.startsWith(prefix)) {
    throw new Error(`Expected diff to start with ${JSON.stringify(prefix)}`)
  }

  return [serializedDiff.slice(0, prefix.length), serializedDiff.slice(prefix.length)]
}

async function runSplitRenderedDiffCapture(
  diff: Diff,
  name: string,
): Promise<{ mid: string; final: string }> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'code-tmux-split-rendered-reset-'))
  try {
    const serializedDiff = serializeDiff(diff)
    const [firstChunk, secondChunk] = splitAfterFirstRenderedRow(serializedDiff)
    const firstChunkPath = join(tmpDir, `${name}.part1.seq`)
    const secondChunkPath = join(tmpDir, `${name}.part2.seq`)
    const midReadyPath = join(tmpDir, `${name}.mid.ready`)
    const donePath = join(tmpDir, `${name}.done.ready`)
    writeFileSync(firstChunkPath, firstChunk)
    writeFileSync(secondChunkPath, secondChunk)

    const session = createIsolatedTmuxSession({
      command:
        `bash -lc '` +
        `i=1; ` +
        `while [ "$i" -le 40 ]; do printf "L%02d\\n" "$i"; i=$((i+1)); done; ` +
        `cat ${shellQuote(firstChunkPath)}; ` +
        `touch ${shellQuote(midReadyPath)}; ` +
        `sleep 1; ` +
        `cat ${shellQuote(secondChunkPath)}; ` +
        `touch ${shellQuote(donePath)}; ` +
        `sleep 5` +
        `'`,
      width: 80,
      height: 10,
    })
    liveSessions.push(session)

    await waitForFile(midReadyPath)
    const mid = capturePane(session, { startLine: -80 })
    await waitForFile(donePath)
    const final = capturePane(session, { startLine: -80 })
    return { mid, final }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

async function runAltScreenPreambleCapture(
  diff: Diff,
  name: string,
): Promise<{ mid: string; final: string }> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'code-tmux-alt-screen-repaint-'))
  try {
    const serializedDiff = serializeDiff(diff)
    const [firstChunk, secondChunk] = splitAfterPrefix(serializedDiff, '\u001b[H')
    const firstChunkPath = join(tmpDir, `${name}.part1.seq`)
    const secondChunkPath = join(tmpDir, `${name}.part2.seq`)
    const midReadyPath = join(tmpDir, `${name}.mid.ready`)
    const donePath = join(tmpDir, `${name}.done.ready`)
    writeFileSync(firstChunkPath, firstChunk)
    writeFileSync(secondChunkPath, secondChunk)

    const session = createIsolatedTmuxSession({
      command:
        `bash -lc '` +
        `printf "\\033[?1049h"; ` +
        `printf "OLD1\\nOLD2\\nOLD3"; ` +
        `cat ${shellQuote(firstChunkPath)}; ` +
        `touch ${shellQuote(midReadyPath)}; ` +
        `sleep 1; ` +
        `cat ${shellQuote(secondChunkPath)}; ` +
        `touch ${shellQuote(donePath)}; ` +
        `sleep 5` +
        `'`,
      width: 80,
      height: 10,
    })
    liveSessions.push(session)

    await waitForFile(midReadyPath)
    const mid = capturePane(session, { startLine: -40 })
    await waitForFile(donePath)
    const final = capturePane(session, { startLine: -40 })
    return { mid, final }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

async function runAltScreenRecoveryCapture(
  recoveryPreamble: string,
  diff: Diff,
  name: string,
): Promise<{ mid: string; final: string }> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'code-tmux-alt-screen-recovery-'))
  try {
    const preamblePath = join(tmpDir, `${name}.preamble.seq`)
    const diffPath = join(tmpDir, `${name}.diff.seq`)
    const midReadyPath = join(tmpDir, `${name}.mid.ready`)
    const donePath = join(tmpDir, `${name}.done.ready`)
    writeFileSync(preamblePath, recoveryPreamble)
    writeFileSync(diffPath, serializeDiff(diff))

    const session = createIsolatedTmuxSession({
      command:
        `bash -lc '` +
        `printf "\\033[?1049h"; ` +
        `printf "OLD1\\nOLD2\\nOLD3"; ` +
        `cat ${shellQuote(preamblePath)}; ` +
        `touch ${shellQuote(midReadyPath)}; ` +
        `sleep 1; ` +
        `cat ${shellQuote(diffPath)}; ` +
        `touch ${shellQuote(donePath)}; ` +
        `sleep 5` +
        `'`,
      width: 80,
      height: 10,
    })
    liveSessions.push(session)

    await waitForFile(midReadyPath)
    const mid = capturePane(session, { startLine: -40 })
    await waitForFile(donePath)
    const final = capturePane(session, { startLine: -40 })
    return { mid, final }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

async function runNormalScreenRepaintBelowPromptCapture(
  initialDiff: Diff,
  repaintDiff: Diff,
  name: string,
): Promise<string> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'code-tmux-normal-repaint-'))
  try {
    const initialPath = join(tmpDir, `${name}.initial.seq`)
    const repaintPath = join(tmpDir, `${name}.repaint.seq`)
    const donePath = join(tmpDir, `${name}.done.ready`)
    writeFileSync(initialPath, serializeDiff(initialDiff))
    writeFileSync(repaintPath, serializeDiff(repaintDiff))

    const session = createIsolatedTmuxSession({
      command:
        `bash -lc '` +
        `printf "shell-prompt\\n"; ` +
        `cat ${shellQuote(initialPath)}; ` +
        `cat ${shellQuote(repaintPath)}; ` +
        `touch ${shellQuote(donePath)}; ` +
        `sleep 5` +
        `'`,
      width: 40,
      height: 8,
    })
    liveSessions.push(session)

    await waitForFile(donePath)
    return capturePane(session, { startLine: -20 })
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

async function runNormalScreenClearFirstRepaintCapture(
  initialDiff: Diff,
  repaintDiff: Diff,
  name: string,
): Promise<{ mid: string; final: string }> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'code-tmux-compact-repaint-'))
  try {
    const serializedRepaint = serializeDiff(repaintDiff)
    const [clearChunk, paintChunk] = splitAfterPrefix(
      serializedRepaint,
      ERASE_SCREEN + CURSOR_HOME,
    )
    const initialPath = join(tmpDir, `${name}.initial.seq`)
    const clearPath = join(tmpDir, `${name}.clear.seq`)
    const paintPath = join(tmpDir, `${name}.paint.seq`)
    const midReadyPath = join(tmpDir, `${name}.mid.ready`)
    const donePath = join(tmpDir, `${name}.done.ready`)
    writeFileSync(initialPath, serializeDiff(initialDiff))
    writeFileSync(clearPath, clearChunk)
    writeFileSync(paintPath, paintChunk)

    const session = createIsolatedTmuxSession({
      command:
        `bash -lc '` +
        `cat ${shellQuote(initialPath)}; ` +
        `cat ${shellQuote(clearPath)}; ` +
        `touch ${shellQuote(midReadyPath)}; ` +
        `sleep 1; ` +
        `cat ${shellQuote(paintPath)}; ` +
        `touch ${shellQuote(donePath)}; ` +
        `sleep 5` +
        `'`,
      width: 40,
      height: 8,
    })
    liveSessions.push(session)

    await waitForFile(midReadyPath)
    const mid = capturePane(session, { startLine: 0 })
    await waitForFile(donePath)
    const final = capturePane(session, { startLine: 0 })
    return { mid, final }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

describe('tmux reset sequence integration', () => {
  tmuxIt('keeps pane history reachable after a resize clear', async () => {
    const capture = await runResetCapture('resize')

    expect(capture).toContain('L01')
    expect(capture).toContain('L20')
    expect(capture).toContain('L40')
  })

  tmuxIt('preserves pane history on an offscreen reset', async () => {
    const capture = await runResetCapture('offscreen')

    expect(capture).toContain('L01')
    expect(capture).toContain('L20')
    expect(capture).toContain('L40')
  })

  tmuxIt('preserves history and paints the new frame for a rendered resize reset', async () => {
    const log = new LogUpdate({ isTTY: true, stylePool })
    const diff = log.render(
      makeFrame({
        lines: ['RESIZE-FRAME'],
        viewportWidth: 14,
        viewportHeight: 10,
      }),
      makeFrame({
        lines: ['RESIZE-FRAME'],
        viewportWidth: 10,
        viewportHeight: 10,
      }),
    )

    const capture = await runRenderedDiffCapture(diff, 'rendered-resize')

    expect(capture).toContain('L01')
    expect(capture).toContain('L20')
    expect(capture).toContain('L31')
    expect(capture).toContain('RESIZE-FRA')
  })

  tmuxIt('keeps visible shell rows intact during safe normal-screen resize repaint', async () => {
    const log = new LogUpdate({ isTTY: true, stylePool })
    const initialFrame = makeFrame({
      lines: ['APP-OLD-WIDE'],
      viewportWidth: 14,
      viewportHeight: 8,
      cursorY: 1,
    })
    const resizedFrame = makeFrame({
      lines: ['APP-NEW'],
      viewportWidth: 10,
      viewportHeight: 8,
      cursorY: 1,
    })
    const initialDiff = log.render(
      makeFrame({
        lines: [],
        viewportWidth: 14,
        viewportHeight: 8,
        screenHeight: 0,
        cursorY: 0,
      }),
      initialFrame,
    )
    const repaintDiff = log.render(initialFrame, resizedFrame)

    const capture = await runNormalScreenRepaintBelowPromptCapture(
      initialDiff,
      repaintDiff,
      'normal-screen-resize-repaint',
    )

    expect(capture).toContain('shell-prompt')
    expect(capture).toContain('APP-NEW')
    expect(capture).not.toContain('APP-NEWmpt')
    expect(capture).not.toContain('APP-OLD-WIDE')
  })

  tmuxIt('keeps visible shell rows intact during explicit normal-screen recovery repaint', async () => {
    const log = new LogUpdate({ isTTY: true, stylePool })
    const frame = makeFrame({
      lines: ['APP1', 'APP2'],
      viewportWidth: 10,
      viewportHeight: 8,
      cursorY: 2,
    })
    const initialDiff = log.render(
      makeFrame({
        lines: [],
        viewportWidth: 10,
        viewportHeight: 8,
        screenHeight: 0,
        cursorY: 0,
      }),
      frame,
    )
    const repaintDiff = log.renderFullRepaintFromPreviousOutputTop(frame, frame, {
      clearRowsBeforeWrite: true,
    })

    const capture = await runNormalScreenRepaintBelowPromptCapture(
      initialDiff,
      repaintDiff,
      'normal-screen-explicit-repaint',
    )

    expect(capture).toContain('shell-prompt')
    expect(capture).toContain('APP1')
    expect(capture).toContain('APP2')
    expect(capture).not.toContain('APP1l-prompt')
    expect(capture.match(/APP2/g)?.length ?? 0).toBe(1)
  })

  tmuxIt('clears old normal-screen compact content before repainting replacement rows', async () => {
    const log = new LogUpdate({ isTTY: true, stylePool })
    const oldFrame = makeFrame({
      lines: ['OLD-COMPACT-1', 'OLD-COMPACT-2', 'OLD-COMPACT-3'],
      viewportWidth: 14,
      viewportHeight: 8,
      cursorY: 3,
    })
    const compactFrame = makeFrame({
      lines: ['COMPACTED'],
      viewportWidth: 10,
      viewportHeight: 8,
      cursorY: 1,
    })
    const initialDiff = log.render(
      makeFrame({
        lines: [],
        viewportWidth: 14,
        viewportHeight: 8,
        screenHeight: 0,
        cursorY: 0,
      }),
      oldFrame,
    )
    const repaintDiff = log.renderFullRepaintFromHome(compactFrame, oldFrame, {
      clearRowsBeforeWrite: true,
      clearViewportBeforeWrite: true,
    })

    const capture = await runNormalScreenClearFirstRepaintCapture(
      initialDiff,
      repaintDiff,
      'normal-screen-compact-clear-first',
    )

    expect(capture.mid).not.toContain('OLD-COMPACT')
    expect(capture.mid).not.toContain('COMPACTED')
    expect(capture.final).toContain('COMPACTED')
    expect(capture.final).not.toContain('OLD-COMPACT')
  })

  tmuxIt('clear-first main-screen repaint does not replay hidden scrollback rows from home', async () => {
    const log = new LogUpdate({ isTTY: true, stylePool })
    const oldFrame = makeFrame({
      lines: [
        'OLD-HIDDEN-0',
        'OLD-HIDDEN-1',
        'OLD-HIDDEN-2',
        'OLD-VIS-0',
        'OLD-VIS-1',
        'OLD-VIS-2',
        'OLD-VIS-3',
        'OLD-VIS-4',
        'OLD-VIS-5',
        'OLD-VIS-6',
      ],
      viewportWidth: 16,
      viewportHeight: 8,
      cursorY: 10,
    })
    const nextFrame = makeFrame({
      lines: [
        'HIDDEN-0',
        'HIDDEN-1',
        'HIDDEN-2',
        'VIS-0',
        'VIS-1',
        'VIS-2',
        'VIS-3',
        'VIS-4',
        'VIS-5',
        'VIS-6',
      ],
      viewportWidth: 16,
      viewportHeight: 8,
      cursorY: 10,
    })
    const initialDiff = log.render(
      makeFrame({
        lines: [],
        viewportWidth: 16,
        viewportHeight: 8,
        screenHeight: 0,
        cursorY: 0,
      }),
      oldFrame,
    )
    const repaintDiff = log.renderMainScreenRepaintFromHome(nextFrame, oldFrame, {
      clearRowsBeforeWrite: true,
      clearViewportBeforeWrite: true,
    })

    const capture = await runNormalScreenClearFirstRepaintCapture(
      initialDiff,
      repaintDiff,
      'normal-screen-scrollback-clear-first',
    )

    expect(capture.mid).not.toContain('OLD-')
    expect(capture.mid).not.toContain('VIS-')
    expect(capture.final).toContain('VIS-0')
    expect(capture.final).toContain('VIS-6')
    expect(capture.final).not.toContain('HIDDEN-')
    expect(capture.final).not.toContain('OLD-')
    expect(capture.final.match(/VIS-6/g)?.length ?? 0).toBe(1)
  })

  tmuxIt('preserves history and paints the new frame for a rendered offscreen reset', async () => {
    const log = new LogUpdate({ isTTY: true, stylePool })
    const diff = log.render(
      makeFrame({
        lines: ['OLD0', 'OLD1', 'OLD2', 'OLD3', 'OLD4', 'OLD5'],
        viewportWidth: 10,
        viewportHeight: 5,
        cursorY: 6,
      }),
      makeFrame({
        lines: ['VIS1', 'VIS2', 'VIS3', 'VIS4', 'VIS5'],
        viewportWidth: 10,
        viewportHeight: 5,
        cursorY: 5,
      }),
    )

    const capture = await runRenderedDiffCapture(diff, 'rendered-offscreen')

    expect(capture).toContain('L01')
    expect(capture).toContain('L20')
    expect(capture).toContain('L40')
    expect(capture).toContain('VIS1')
    expect(capture).toContain('VIS5')
  })

  tmuxIt('does not blank the pane during an in-flight rendered offscreen repaint', async () => {
    const log = new LogUpdate({ isTTY: true, stylePool })
    const diff = log.render(
      makeFrame({
        lines: ['OLD0', 'OLD1', 'OLD2', 'OLD3', 'OLD4', 'OLD5'],
        viewportWidth: 10,
        viewportHeight: 5,
        cursorY: 6,
      }),
      makeFrame({
        lines: ['VIS1', 'VIS2', 'VIS3', 'VIS4', 'VIS5'],
        viewportWidth: 10,
        viewportHeight: 5,
        cursorY: 5,
      }),
    )

    const capture = await runSplitRenderedDiffCapture(
      diff,
      'rendered-offscreen-midflight',
    )

    expect(capture.mid).toContain('VIS1')
    expect(capture.mid).toContain('L34')
    expect(capture.mid).not.toContain('VIS5')
    expect(capture.final).toContain('VIS1')
    expect(capture.final).toContain('VIS5')
    expect(capture.final).toContain('L01')
  })

  tmuxIt('does not blank the pane during an in-flight rendered resize repaint', async () => {
    const log = new LogUpdate({ isTTY: true, stylePool })
    const diff = log.render(
      makeFrame({
        lines: ['RESIZE-FRAME'],
        viewportWidth: 14,
        viewportHeight: 10,
      }),
      makeFrame({
        lines: ['RESIZE-FRAME'],
        viewportWidth: 10,
        viewportHeight: 10,
      }),
    )

    const capture = await runSplitRenderedDiffCapture(
      diff,
      'rendered-resize-midflight',
    )

    expect(capture.mid).toContain('RESIZE-FRA')
    expect(capture.mid).toContain('L34')
    expect(capture.final).toContain('RESIZE-FRA')
    expect(capture.final).toContain('L01')
  })

  tmuxIt('keeps old alternate-screen content visible until the width-repaint fallback starts painting', async () => {
    const log = new LogUpdate({ isTTY: true, stylePool })
    const diff = log.renderFullRepaintFromHome(
      makeFrame({
        lines: ['NEW1', 'NEW2', 'NEW3'],
        viewportWidth: 8,
        viewportHeight: 10,
        cursorY: 3,
      }),
      makeFrame({
        lines: ['OLD-LINE-ONE', 'OLD-LINE-TWO', 'OLD-LINE-THREE'],
        viewportWidth: 14,
        viewportHeight: 10,
        cursorY: 3,
      }),
      { clearRowsBeforeWrite: true },
    )

    const capture = await runAltScreenPreambleCapture(
      diff,
      'alt-screen-width-repaint',
    )

    expect(capture.mid).toContain('OLD1')
    expect(capture.mid).toContain('OLD2')
    expect(capture.mid).toContain('OLD3')
    expect(capture.final).toContain('NEW1')
    expect(capture.final).toContain('NEW2')
    expect(capture.final).toContain('NEW3')
  })

  tmuxIt('keeps old alternate-screen content visible during recovery before the repaint lands', async () => {
    const log = new LogUpdate({ isTTY: true, stylePool })
    const diff = log.renderFullRepaintFromHome(
      makeFrame({
        lines: ['RECOVER1', 'RECOVER2'],
        viewportWidth: 10,
        viewportHeight: 10,
        cursorY: 2,
      }),
      undefined,
      { clearRowsBeforeWrite: true },
    )

    const capture = await runAltScreenRecoveryCapture(
      ENTER_ALT_SCREEN + CURSOR_HOME,
      diff,
      'alt-screen-recovery',
    )

    expect(capture.mid).toContain('OLD1')
    expect(capture.mid).toContain('OLD2')
    expect(capture.mid).toContain('OLD3')
    expect(capture.final).toContain('RECOVER1')
    expect(capture.final).toContain('RECOVER2')
  })

  tmuxIt('REPRO: current manual repaint sequence fails to repair a fused stale tmux row', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'code-tmux-manual-repaint-repro-'))
    try {
      const sequencePath = join(tmpDir, 'manual-repaint.seq')
      const donePath = join(tmpDir, 'manual-repaint.done')
      const eraseLineSeq = '\u001b[2K'
      const eraseToEndOfScreenSeq = '\u001b[J'
      const sequence =
        ERASE_SCREEN +
        CURSOR_HOME +
        eraseLineSeq +
        'header\r\n' +
        eraseLineSeq +
        '* Crunching...\r\n' +
        eraseLineSeq +
        '  > Tip: Run ncode --continue or ncode --resume to resume a conversation\r\n' +
        eraseLineSeq +
        '--\r\n' +
        eraseLineSeq +
        'PROMPT\r\n' +
        eraseLineSeq +
        '--\r\n' +
        eraseLineSeq +
        'status\r\n' +
        eraseToEndOfScreenSeq +
        '\r' +
        '\u001b[6A' +
        'PROMPT /' +
        '\u001b[1C' +
        'epaint' +
        eraseLineSeq +
        '\r\n' +
        '  ' +
        '\u001b[3C' +
        'Re' +
        '\u001b[1C' +
        'aint requested. Renderer diagnostic written to:' +
        eraseLineSeq +
        '\r\n' +
        '     /tmp/repaint.json\r\n' +
        '--\r\n' +
        'PROMPT' +
        eraseLineSeq +
        '\r\n' +
        '--' +
        eraseLineSeq +
        '\r\n' +
        'status\r\n'
      writeFileSync(sequencePath, sequence)

      const session = createIsolatedTmuxSession({
        command:
          `bash -lc ` +
          shellQuote(
            `printf 'header\n* Crunching...\n  > Repaint requested. Renderer diagnostic written to:ume a conversation\n\n--\nPROMPT\n--\nstatus\n'; ` +
              `cat ${shellQuote(sequencePath)}; ` +
              `touch ${shellQuote(donePath)}; ` +
              `sleep 5`,
          ),
        width: 90,
        height: 12,
      })
      liveSessions.push(session)

      await waitForFile(donePath)
      const capture = capturePane(session, { startLine: 0 })

      expect(capture).toContain('/tmp/repaint.json')
      expect(capture).not.toContain('written to:ume a conversation')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

async function runRepaintThenIncrementalCapture(
  initialDiff: Diff,
  repaintDiff: Diff,
  incrementalDiff: Diff,
  viewportWidth: number,
  viewportHeight: number,
): Promise<string> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'code-tmux-repaint-incremental-'))
  try {
    const initialPath = join(tmpDir, 'initial.seq')
    const repaintPath = join(tmpDir, 'repaint.seq')
    const incrementalPath = join(tmpDir, 'incremental.seq')
    const donePath = join(tmpDir, 'done')

    writeFileSync(initialPath, serializeDiff(initialDiff))
    writeFileSync(repaintPath, serializeDiff(repaintDiff))
    writeFileSync(incrementalPath, serializeDiff(incrementalDiff))

    const session = createIsolatedTmuxSession({
      command:
        `bash -lc '` +
        `printf "shell-prompt\\n"; ` +
        `cat ${shellQuote(initialPath)}; ` +
        `cat ${shellQuote(repaintPath)}; ` +
        `sleep 0.2; ` +
        `cat ${shellQuote(incrementalPath)}; ` +
        `touch ${shellQuote(donePath)}; ` +
        `sleep 5'`,
      width: viewportWidth,
      height: viewportHeight,
    })
    liveSessions.push(session)

    await waitForFile(donePath)
    return capturePane(session, { startLine: 0 })
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

tmuxIt('uses a physical cursor origin after main-screen repaint before incremental diff', async () => {
  const log = new LogUpdate({ isTTY: true, stylePool })
  const viewportWidth = 40
  const viewportHeight = 6
  const rowCount = 20

  const tallFrame = makeFrame({
    lines: Array.from({ length: rowCount }, (_, i) => `row-${String(i).padStart(2, '0')}`),
    viewportWidth,
    viewportHeight,
    cursorY: rowCount,
  })

  const changedFrame = makeFrame({
    lines: [
      ...Array.from({ length: rowCount - 3 }, (_, i) => `row-${String(i).padStart(2, '0')}`),
      'CHANGED-A',
      'CHANGED-B',
      'CHANGED-C',
    ],
    viewportWidth,
    viewportHeight,
    cursorY: rowCount,
  })

  const emptyFrame = makeFrame({
    lines: [],
    viewportWidth,
    viewportHeight,
    screenHeight: 0,
    cursorY: 0,
  })

  const initialDiff = log.render(emptyFrame, tallFrame)

  const repaintDiff = log.renderMainScreenRepaintFromHome(tallFrame, undefined, {
    clearRowsBeforeWrite: true,
    clearViewportBeforeWrite: true,
  })

  const buggyPrev = makeFrame({
    lines: Array.from({ length: rowCount }, (_, i) => `row-${String(i).padStart(2, '0')}`),
    viewportWidth,
    viewportHeight,
    cursorY: rowCount,
  })

  const buggyIncrementalDiff = log.render(buggyPrev, changedFrame)
  const fixedIncrementalDiff = log.render(buggyPrev, changedFrame)

  const buggyCapture = await runRepaintThenIncrementalCapture(
    initialDiff, repaintDiff, buggyIncrementalDiff, viewportWidth, viewportHeight,
  )

  const fixedCapture = await runRepaintThenIncrementalCapture(
    initialDiff, repaintDiff, fixedIncrementalDiff, viewportWidth, viewportHeight,
  )

  console.log('BUGGY CAPTURE:\n', buggyCapture)
  console.log('FIXED CAPTURE:\n', fixedCapture)

  // Both paths update the changed tail, but the old logical-cursor origin
  // leaves stale rows 15–16 at the top of the visible viewport. The explicit
  // physical cursor origin keeps the viewport anchored at rows 18–19 above the
  // changed tail.
  expect(buggyCapture).toContain('CHANGED-A')
  expect(buggyCapture).toContain('CHANGED-B')
  expect(buggyCapture).toContain('CHANGED-C')
  expect(buggyCapture).toContain('row-15')
  expect(buggyCapture).toContain('row-16')
  expect(buggyCapture).not.toContain('row-18')
  expect(buggyCapture).not.toContain('row-19')

  expect(fixedCapture).toContain('CHANGED-A')
  expect(fixedCapture).toContain('CHANGED-B')
  expect(fixedCapture).toContain('CHANGED-C')
  expect(fixedCapture).toContain('row-15')
  expect(fixedCapture).toContain('row-16')
})

tmuxIt('keeps bash output readable after main-screen recovery repaint plus incremental update', async () => {
  const log = new LogUpdate({ isTTY: true, stylePool })
  const viewportWidth = 64
  const viewportHeight = 10
  const rowCount = 15

  // Simulate a bash output block (like `ls -la` result).
  // Lines must fit within viewportWidth to avoid natural truncation by the
  // frame width — the bug we are hunting is rendering corruption, not wrapping.
  const bashOutputRows = [
    'total 128',
    'drwxr-xr-x 12 user user 4096 Jun 12 00:00 .',
    'drwxr-xr-x  6 user user 4096 Jun 11 23:00 ..',
    '-rw-r--r--  1 user user 2341 Jun 12 00:00 README.md',
    '-rw-r--r--  1 user user 8192 Jun 12 00:00 package.json',
    '-rw-r--r--  1 user user 1024 Jun 12 00:00 tsconfig.json',
    '-rw-r--r--  1 user user 2048 Jun 12 00:00 Makefile',
    '-rw-r--r--  1 user user  512 Jun 12 00:00 .env',
    '-rw-r--r--  1 user user 4096 Jun 12 00:00 src/',
    '-rw-r--r--  1 user user 1024 Jun 12 00:00 tests/',
    '-rw-r--r--  1 user user  768 Jun 12 00:00 .gitignore',
    '-rw-r--r--  1 user user 1536 Jun 12 00:00 docker-compose.yml',
    '-rw-r--r--  1 user user  256 Jun 12 00:00 Dockerfile',
    '-rw-r--r--  1 user user  128 Jun 12 00:00 .nvmrc',
    '14 files, 128K total',
  ]

  const bashFrame = makeFrame({
    lines: bashOutputRows,
    viewportWidth,
    viewportHeight,
    cursorY: rowCount,
  })

  const bashWithPromptFrame = makeFrame({
    lines: [
      ...bashOutputRows,
      'Post-execution: ready for next command',
    ],
    viewportWidth,
    viewportHeight,
    cursorY: rowCount + 1,
  })

  const emptyFrame = makeFrame({
    lines: [],
    viewportWidth,
    viewportHeight,
    screenHeight: 0,
    cursorY: 0,
  })

  const initialDiff = log.render(emptyFrame, bashFrame)

  const repaintDiff = log.renderMainScreenRepaintFromHome(bashFrame, undefined, {
    clearRowsBeforeWrite: true,
    clearViewportBeforeWrite: true,
  })

  const prev = makeFrame({
    lines: bashOutputRows,
    viewportWidth,
    viewportHeight,
    cursorY: rowCount,
  })

  const incrementalDiff = log.render(prev, bashWithPromptFrame)

  const capture = await runRepaintThenIncrementalCapture(
    initialDiff, repaintDiff, incrementalDiff, viewportWidth, viewportHeight,
  )

  expect(capture).toContain('Post-execution: ready for next command')
  expect(capture).toContain('docker-compose.yml')
  expect(capture).not.toContain('docker-compose.ymlDockerfile')
})
