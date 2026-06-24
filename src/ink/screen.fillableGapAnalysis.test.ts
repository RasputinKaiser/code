import type { AnsiCode } from '@alcalzone/ansi-tokenize'
import { describe, expect, it } from 'bun:test'
import {
  analyzeFillableSpaceGap,
  CellWidth,
  CharPool,
  createScreen,
  HyperlinkPool,
  setCellAt,
  StylePool,
} from './screen.js'

function createTestScreen() {
  const stylePool = new StylePool()
  const charPool = new CharPool()
  const hyperlinkPool = new HyperlinkPool()
  const screen = createScreen(8, 1, stylePool, charPool, hyperlinkPool)
  return { stylePool, screen }
}

describe('analyzeFillableSpaceGap', () => {
  it('returns a partial prefix when a later gap cell is non-space content', () => {
    const { stylePool, screen } = createTestScreen()
    setCellAt(screen, 1, 0, {
      char: ' ',
      styleId: stylePool.none,
      width: CellWidth.Narrow,
      hyperlink: undefined,
    })
    setCellAt(screen, 2, 0, {
      char: ' ',
      styleId: stylePool.none,
      width: CellWidth.Narrow,
      hyperlink: undefined,
    })
    setCellAt(screen, 3, 0, {
      char: 'B',
      styleId: stylePool.none,
      width: CellWidth.Narrow,
      hyperlink: undefined,
    })

    expect(
      analyzeFillableSpaceGap(
        screen,
        0,
        1,
        4,
        stylePool.none,
        undefined,
        stylePool.none,
      ),
    ).toEqual({
      fillableCells: 2,
      blocker: 'non-space-char',
    })
  })

  it('returns a partial prefix when default spaces would reset a non-default style', () => {
    const { stylePool, screen } = createTestScreen()
    const redStyle = stylePool.intern([
      { code: '\u001b[31m', endCode: '\u001b[39m' } satisfies AnsiCode,
    ])
    setCellAt(screen, 1, 0, {
      char: ' ',
      styleId: redStyle,
      width: CellWidth.Narrow,
      hyperlink: undefined,
    })
    setCellAt(screen, 2, 0, {
      char: ' ',
      styleId: redStyle,
      width: CellWidth.Narrow,
      hyperlink: undefined,
    })
    setCellAt(screen, 3, 0, {
      char: ' ',
      styleId: stylePool.none,
      width: CellWidth.Narrow,
      hyperlink: undefined,
    })

    expect(
      analyzeFillableSpaceGap(
        screen,
        0,
        1,
        4,
        redStyle,
        undefined,
        stylePool.none,
      ),
    ).toEqual({
      fillableCells: 2,
      blocker: 'default-style-mismatch',
    })
  })

  it('refuses gap fill when a hyperlink is currently active', () => {
    const { stylePool, screen } = createTestScreen()
    setCellAt(screen, 1, 0, {
      char: ' ',
      styleId: stylePool.none,
      width: CellWidth.Narrow,
      hyperlink: undefined,
    })

    expect(
      analyzeFillableSpaceGap(
        screen,
        0,
        1,
        2,
        stylePool.none,
        'https://noumena.ai',
        stylePool.none,
      ),
    ).toEqual({
      fillableCells: 0,
      blocker: 'active-hyperlink',
    })
  })
})
