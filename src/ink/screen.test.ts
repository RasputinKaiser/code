import type { AnsiCode } from '@alcalzone/ansi-tokenize'
import { describe, expect, it } from 'bun:test'
import {
  CellWidth,
  CharPool,
  createScreen,
  HyperlinkPool,
  setCellAt,
  StylePool,
  cellAt,
} from './screen.js'

function style(index: number): AnsiCode {
  return {
    code: `\x1b[38;5;${index % 256}m-${index}`,
    endCode: '\x1b[39m',
  }
}

function visibleSpaceStyle(index: number): AnsiCode {
  return {
    code: `\x1b[48;5;${index % 256}m-${index}`,
    endCode: '\x1b[49m',
  }
}

function fillRawStyles(pool: StylePool, rawStyleCount: number): void {
  for (let i = 1; i < rawStyleCount; i += 1) {
    pool.intern([style(i)])
  }
}

describe('StylePool packed-cell overflow', () => {
  it('round-trips the maximum safe packed style id', () => {
    const stylePool = new StylePool()
    fillRawStyles(stylePool, 16_383)
    const styleId = stylePool.intern([style(16_383)])
    expect(styleId).toBe(0x7ffe)

    const screen = createScreen(10, 1, stylePool, new CharPool(), new HyperlinkPool())
    setCellAt(screen, 0, 0, {
      char: 'X',
      styleId,
      width: CellWidth.Narrow,
      hyperlink: undefined,
    })

    expect(cellAt(screen, 0, 0)!.styleId).toBe(styleId)
  })

  it('round-trips the maximum safe visible-space packed style id', () => {
    const stylePool = new StylePool()
    fillRawStyles(stylePool, 16_383)
    const styleId = stylePool.intern([visibleSpaceStyle(16_383)])
    expect(styleId).toBe(0x7fff)

    const screen = createScreen(10, 1, stylePool, new CharPool(), new HyperlinkPool())
    setCellAt(screen, 0, 0, {
      char: 'X',
      styleId,
      width: CellWidth.Narrow,
      hyperlink: undefined,
    })

    expect(cellAt(screen, 0, 0)!.styleId).toBe(styleId)
  })

  it('degrades the first unsafe packed style id to none without corrupting prior styles', () => {
    const stylePool = new StylePool()
    fillRawStyles(stylePool, 16_384)
    const safeStyleId = stylePool.intern([style(16_383)])
    const unsafeStyleId = stylePool.intern([style(16_384)])
    const repeatedUnsafeStyleId = stylePool.intern([style(16_384)])

    expect(stylePool.none).toBe(0)
    expect(safeStyleId).toBe(0x7ffe)
    expect(unsafeStyleId).toBe(stylePool.none)
    expect(repeatedUnsafeStyleId).toBe(stylePool.none)

    const screen = createScreen(10, 1, stylePool, new CharPool(), new HyperlinkPool())
    setCellAt(screen, 0, 0, {
      char: 'S',
      styleId: safeStyleId,
      width: CellWidth.Narrow,
      hyperlink: undefined,
    })
    setCellAt(screen, 1, 0, {
      char: 'U',
      styleId: unsafeStyleId,
      width: CellWidth.Narrow,
      hyperlink: undefined,
    })

    expect(cellAt(screen, 0, 0)!.styleId).toBe(safeStyleId)
    expect(cellAt(screen, 1, 0)!.styleId).toBe(stylePool.none)
  })
})
