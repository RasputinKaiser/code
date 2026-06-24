import { describe, expect, it } from 'bun:test'
import type { Frame } from './frame.js'
import { shouldResetForResize } from './log-update.js'
import { getResetSequenceForReason } from './clearTerminal.js'
import {
  CellWidth,
  CharPool,
  createScreen,
  HyperlinkPool,
  setCellAt,
  StylePool,
} from './screen.js'
import { ERASE_SCROLLBACK } from './termio/csi.js'

const stylePool = new StylePool()
const charPool = new CharPool()
const hyperlinkPool = new HyperlinkPool()

function withNoTmuxEnv<T>(fn: () => T): T {
  const previousTmux = process.env.TMUX
  delete process.env.TMUX
  try {
    return fn()
  } finally {
    if (previousTmux !== undefined) {
      process.env.TMUX = previousTmux
    }
  }
}

function makeFrame({
  viewportWidth = 80,
  viewportHeight,
  screenHeight,
  cursorY,
  lines = [],
}: {
  viewportWidth?: number
  viewportHeight: number
  screenHeight: number
  cursorY: number
  lines?: string[]
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

describe('shouldResetForResize', () => {
  it('skips destructive reset for height-only shrink when prior content and cursor still fit', () => {
    const prev = makeFrame({
      viewportHeight: 40,
      screenHeight: 10,
      cursorY: 10,
    })
    const next = makeFrame({
      viewportHeight: 20,
      screenHeight: 10,
      cursorY: 10,
    })

    expect(shouldResetForResize(prev, next)).toBe(false)
  })

  it('skips destructive reset when height-only shrink leaves content exactly fitting the new viewport', () => {
    const prev = makeFrame({
      viewportHeight: 12,
      screenHeight: 6,
      cursorY: 5,
      lines: ['0', '1', '2', '3', '4', '5'],
    })
    const next = makeFrame({
      viewportHeight: 6,
      screenHeight: 6,
      cursorY: 5,
      lines: ['0', '1', '2', '3', '4', '5'],
    })

    expect(shouldResetForResize(prev, next)).toBe(false)
  })

  it('skips reset when height-only shrink clips only blank structural rows', () => {
    const visibleRows = Array.from({ length: 10 }, (_, index) => String(index))
    const prev = makeFrame({
      viewportHeight: 40,
      screenHeight: 22,
      cursorY: 10,
      lines: visibleRows,
    })
    const next = makeFrame({
      viewportHeight: 20,
      screenHeight: 10,
      cursorY: 10,
      lines: visibleRows,
    })

    expect(shouldResetForResize(prev, next)).toBe(false)
  })

  it('still resets when height-only shrink clips visible rows below the new viewport', () => {
    const prev = makeFrame({
      viewportHeight: 40,
      screenHeight: 22,
      cursorY: 10,
      lines: [
        ...Array.from({ length: 20 }, (_, index) => String(index)),
        '20',
        '21',
      ],
    })
    const next = makeFrame({
      viewportHeight: 20,
      screenHeight: 10,
      cursorY: 10,
      lines: Array.from({ length: 10 }, (_, index) => String(index)),
    })

    expect(shouldResetForResize(prev, next)).toBe(true)
  })

  it('still resets for width changes', () => {
    const prev = makeFrame({
      viewportWidth: 80,
      viewportHeight: 40,
      screenHeight: 1,
      cursorY: 1,
      lines: ['abcdefghi'],
    })
    const next = makeFrame({
      viewportWidth: 8,
      viewportHeight: 40,
      screenHeight: 1,
      cursorY: 1,
      lines: ['abcdefghi'],
    })

    expect(shouldResetForResize(prev, next)).toBe(true)
  })

  it('skips reset for width-only shrink when visible content and cursor still fit', () => {
    const prev = makeFrame({
      viewportWidth: 10,
      viewportHeight: 10,
      screenHeight: 1,
      cursorY: 1,
      lines: ['abc'],
    })
    const next = makeFrame({
      viewportWidth: 8,
      viewportHeight: 10,
      screenHeight: 1,
      cursorY: 1,
      lines: ['abc'],
    })

    expect(shouldResetForResize(prev, next)).toBe(false)
  })

  it('skips reset for width-only growth when visible content leaves the old right margin', () => {
    const prev = makeFrame({
      viewportWidth: 8,
      viewportHeight: 10,
      screenHeight: 1,
      cursorY: 1,
      lines: ['abc'],
    })
    const next = makeFrame({
      viewportWidth: 10,
      viewportHeight: 10,
      screenHeight: 1,
      cursorY: 1,
      lines: ['abc'],
    })

    expect(shouldResetForResize(prev, next)).toBe(false)
  })

  it('still resets for width-only growth when visible content reaches the old right edge', () => {
    const prev = makeFrame({
      viewportWidth: 8,
      viewportHeight: 10,
      screenHeight: 1,
      cursorY: 1,
      lines: ['abcdefgh'],
    })
    const next = makeFrame({
      viewportWidth: 10,
      viewportHeight: 10,
      screenHeight: 1,
      cursorY: 1,
      lines: ['abcdefgh'],
    })

    expect(shouldResetForResize(prev, next)).toBe(true)
  })

  it('still resets for width-only shrink when scrollback risk exists', () => {
    const prev = makeFrame({
      viewportWidth: 10,
      viewportHeight: 5,
      screenHeight: 5,
      cursorY: 5,
      lines: ['abc', 'def', 'ghi', 'jkl', 'mno'],
    })
    const next = makeFrame({
      viewportWidth: 8,
      viewportHeight: 5,
      screenHeight: 5,
      cursorY: 5,
      lines: ['abc', 'def', 'ghi', 'jkl', 'mno'],
    })

    expect(shouldResetForResize(prev, next)).toBe(true)
  })

  it('still resets when prior content would be clipped by the new viewport', () => {
    const prev = makeFrame({
      viewportHeight: 40,
      screenHeight: 22,
      cursorY: 22,
    })
    const next = makeFrame({
      viewportHeight: 20,
      screenHeight: 22,
      cursorY: 22,
    })

    expect(shouldResetForResize(prev, next)).toBe(true)
  })

  it('still resets when the parked cursor would be forced below the new viewport', () => {
    const prev = makeFrame({
      viewportHeight: 40,
      screenHeight: 19,
      cursorY: 20,
    })
    const next = makeFrame({
      viewportHeight: 20,
      screenHeight: 19,
      cursorY: 19,
    })

    expect(shouldResetForResize(prev, next)).toBe(true)
  })

  it('preserves scrollback for offscreen recovery', () => {
    withNoTmuxEnv(() => {
      expect(getResetSequenceForReason('resize')).not.toContain(ERASE_SCROLLBACK)
      expect(getResetSequenceForReason('offscreen')).not.toContain(ERASE_SCROLLBACK)
      expect(getResetSequenceForReason('clear')).toContain(ERASE_SCROLLBACK)
    })
  })

  it('preserves scrollback for all reset reasons under tmux', () => {
    const previousTmux = process.env.TMUX
    process.env.TMUX = '/tmp/tmux-test/default,1,0'
    try {
      expect(getResetSequenceForReason('resize')).not.toContain(ERASE_SCROLLBACK)
      expect(getResetSequenceForReason('offscreen')).not.toContain(ERASE_SCROLLBACK)
      expect(getResetSequenceForReason('clear')).toContain(ERASE_SCROLLBACK)
    } finally {
      if (previousTmux === undefined) {
        delete process.env.TMUX
      } else {
        process.env.TMUX = previousTmux
      }
    }
  })
})
