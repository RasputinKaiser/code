import { describe, expect, it } from 'bun:test'
import type { AnsiCode } from '@alcalzone/ansi-tokenize'
import type { Diff, Frame } from './frame.js'
import { LogUpdate } from './log-update.js'
import type { Terminal } from './terminal.js'
import { writeDiffToTerminal } from './terminal.js'
import {
  CellWidth,
  CharPool,
  createScreen,
  HyperlinkPool,
  setCellAt,
  StylePool,
} from './screen.js'
import { screenToRows, TerminalReplayOracle } from './terminalReplayOracle.js'

const stylePool = new StylePool()
const charPool = new CharPool()
const hyperlinkPool = new HyperlinkPool()

function makeFrame({
  lines,
  viewportWidth = 40,
  viewportHeight = 10,
  cursorY = lines.length,
  styleId = stylePool.none,
}: {
  lines: string[]
  viewportWidth?: number
  viewportHeight?: number
  cursorY?: number
  styleId?: number
}): Frame {
  const screen = createScreen(
    viewportWidth,
    lines.length,
    stylePool,
    charPool,
    hyperlinkPool,
  )

  for (let y = 0; y < lines.length; y += 1) {
    const line = lines[y] ?? ''
    for (let x = 0; x < line.length; x += 1) {
      setCellAt(screen, x, y, {
        char: line[x]!,
        styleId,
        width: CellWidth.Narrow,
        hyperlink: undefined,
      })
    }
  }

  return {
    screen,
    viewport: { width: viewportWidth, height: viewportHeight },
    cursor: { x: 0, y: cursorY, visible: true },
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

  const previousTmux = process.env.TMUX
  process.env.TMUX = '/tmp/ncode-terminal-oracle/default,1,0'
  try {
    writeDiffToTerminal(terminal, patches)
  } finally {
    if (previousTmux === undefined) {
      delete process.env.TMUX
    } else {
      process.env.TMUX = previousTmux
    }
  }
  return written
}

function replay({
  diff,
  width,
  height,
  initialRows,
  initialCursor,
}: {
  diff: Diff
  width: number
  height: number
  initialRows?: string[]
  initialCursor?: { x: number; y: number }
}): TerminalReplayOracle {
  const oracle = new TerminalReplayOracle({
    width,
    height,
    initialRows,
    initialCursor,
  })
  oracle.feed(serializeDiff(diff))
  return oracle
}

describe('TerminalReplayOracle', () => {
  it('preserves rows that scroll off the full main-screen viewport', () => {
    const oracle = new TerminalReplayOracle({ width: 16, height: 2 })

    oracle.feed('one\r\ntwo\r\nthree\r\nfour')

    expect(oracle.scrollbackRows().map(row => row.trimEnd())).toEqual([
      'one',
      'two',
    ])
    expect(oracle.visibleRows().map(row => row.trimEnd())).toEqual([
      'three',
      'four',
    ])
    expect(oracle.allRows().map(row => row.trimEnd())).toEqual([
      'one',
      'two',
      'three',
      'four',
    ])
  })

  it('clears preserved scrollback on ED3 without clearing visible rows', () => {
    const oracle = new TerminalReplayOracle({ width: 16, height: 2 })

    oracle.feed('one\r\ntwo\r\nthree')
    expect(oracle.scrollbackRows().map(row => row.trimEnd())).toEqual(['one'])

    oracle.feed('\u001b[3J')

    expect(oracle.scrollbackRows()).toEqual([])
    expect(oracle.visibleRows().map(row => row.trimEnd())).toEqual([
      'two',
      'three',
    ])
  })

  it('does not mutate the committed previous frame during DECSTBM scroll optimization', () => {
    const log = new LogUpdate({ isTTY: true, stylePool })
    const prev = makeFrame({
      lines: ['row-0', 'row-1', 'row-2'],
      viewportWidth: 16,
      viewportHeight: 5,
      cursorY: 3,
    })
    const next = {
      ...makeFrame({
        lines: ['row-1', 'row-2', 'row-3'],
        viewportWidth: 16,
        viewportHeight: 5,
        cursorY: 3,
      }),
      scrollHint: {
        top: 0,
        bottom: 2,
        delta: 1,
      },
    }
    const beforeRows = screenToRows(prev.screen)

    log.render(prev, next, true, true)

    expect(screenToRows(prev.screen)).toEqual(beforeRows)
  })

  it('replays incremental stale-letter corrections into the intended screen', () => {
    const log = new LogUpdate({ isTTY: true, stylePool })
    const prev = makeFrame({
      lines: ['Conversationdcompactedt(ctrl+oaforrhistory)'],
      viewportWidth: 64,
    })
    const next = makeFrame({
      lines: ['Conversation compacted (ctrl+o for history)'],
      viewportWidth: 64,
    })

    const diff = log.render(prev, next)
    const oracle = replay({
      diff,
      width: 64,
      height: next.viewport.height,
      initialRows: screenToRows(prev.screen),
      initialCursor: prev.cursor,
    })

    oracle.assertScreenAt(next.screen, 0)
  })

  it('replays home repaint over stale styled-space glyphs into the intended screen', () => {
    const dimStyle = stylePool.intern([
      {
        type: 'ansi',
        code: '\u001b[2m',
        endCode: '\u001b[22m',
      } as AnsiCode,
    ])
    const log = new LogUpdate({ isTTY: true, stylePool })
    const prev = makeFrame({
      lines: ['Searched for 3epatterns, read 1nfile'],
      viewportWidth: 64,
    })
    const next = makeFrame({
      lines: ['Searched for 3 patterns, read 1 file'],
      viewportWidth: 64,
      styleId: dimStyle,
    })

    const diff = log.renderFullRepaintFromHome(next, prev)
    const oracle = replay({
      diff,
      width: 64,
      height: next.viewport.height,
      initialRows: screenToRows(prev.screen),
      initialCursor: { x: 0, y: 0 },
    })

    oracle.assertScreenAt(next.screen, 0)
  })

  it('replays previous-output-top repaint without duplicating rows', () => {
    const log = new LogUpdate({ isTTY: true, stylePool })
    const prev = makeFrame({
      lines: ['APP1', 'APP2'],
      viewportWidth: 24,
      viewportHeight: 8,
      cursorY: 2,
    })

    const diff = log.renderFullRepaintFromPreviousOutputTop(prev, prev, {
      clearRowsBeforeWrite: true,
    })
    const oracle = replay({
      diff,
      width: 24,
      height: 4,
      initialRows: ['shell-prompt', ...screenToRows(prev.screen), ''],
      initialCursor: { x: 0, y: 3 },
    })

    expect(oracle.text()).toContain('APP1')
    expect(oracle.text().match(/APP2/g)?.length ?? 0).toBe(1)
  })
})
