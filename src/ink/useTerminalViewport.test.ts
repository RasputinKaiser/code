import { describe, expect, it } from 'bun:test'
import { calculateTerminalViewportBounds } from './hooks/use-terminal-viewport.js'

describe('calculateTerminalViewportBounds', () => {
  it('does not report scrollback before content reaches the viewport', () => {
    expect(
      calculateTerminalViewportBounds({ screenHeight: 9, rows: 10 }),
    ).toEqual({
      viewportY: 0,
      viewportBottom: 10,
    })
  })

  it('matches log-update exact-fill cursor restore scrollback semantics', () => {
    expect(
      calculateTerminalViewportBounds({ screenHeight: 10, rows: 10 }),
    ).toEqual({
      viewportY: 1,
      viewportBottom: 11,
    })
  })

  it('adds cursor restore scrollback on top of overflowing content', () => {
    expect(
      calculateTerminalViewportBounds({ screenHeight: 13, rows: 10 }),
    ).toEqual({
      viewportY: 4,
      viewportBottom: 14,
    })
  })
})
