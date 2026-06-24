import { describe, expect, it } from 'bun:test'
import type { Frame } from './frame.js'
import { LogUpdate } from './log-update.js'
import {
  CellWidth,
  CharPool,
  createScreen,
  diffEach,
  HyperlinkPool,
  StylePool,
  writePlainAsciiLineAt,
  type Cell,
} from './screen.js'

function createTestScreen(width = 96, height = 1) {
  const stylePool = new StylePool()
  const charPool = new CharPool()
  const hyperlinkPool = new HyperlinkPool()
  return {
    stylePool,
    screen: createScreen(width, height, stylePool, charPool, hyperlinkPool),
  }
}

function makeFrame(
  screen: ReturnType<typeof createTestScreen>['screen'],
  viewportWidth = screen.width,
  viewportHeight = 10,
): Frame {
  return {
    screen,
    viewport: { width: viewportWidth, height: viewportHeight },
    cursor: { x: 0, y: screen.height, visible: true },
  }
}

describe('screen diff contentEnd contract', () => {
  it('emits plain-space overwrites for interior cells that replace stale letters', () => {
    const { stylePool, screen: prev } = createTestScreen()
    const next = createScreen(
      prev.width,
      prev.height,
      stylePool,
      prev.charPool,
      prev.hyperlinkPool,
    )

    const previousText = 'Conversationdcompactedt(ctrl+oaforrhistory)'
    const nextText = 'Conversation compacted (ctrl+o for history)'
    writePlainAsciiLineAt(prev, 0, 0, previousText, stylePool.none)
    writePlainAsciiLineAt(next, 0, 0, nextText, stylePool.none)
    prev.damage = undefined

    const repairedSpaces: number[] = []
    diffEach(prev, next, (x, _y, removed, added) => {
      if (
        removed?.char !== ' ' &&
        added?.char === ' ' &&
        x < nextText.length
      ) {
        repairedSpaces.push(x)
      }
      return false
    })

    expect(repairedSpaces).toEqual(
      [...nextText]
        .map((char, index) => ({ char, index }))
        .filter(({ char, index }) => char === ' ' && previousText[index] !== ' ')
        .map(({ index }) => index),
    )
  })

  it('drives LogUpdate to write blank overwrites for stale letters', () => {
    const { stylePool, screen: prev } = createTestScreen()
    const next = createScreen(
      prev.width,
      prev.height,
      stylePool,
      prev.charPool,
      prev.hyperlinkPool,
    )

    writePlainAsciiLineAt(
      prev,
      0,
      0,
      'Conversationdcompactedt(ctrl+oaforrhistory)',
      stylePool.none,
    )
    writePlainAsciiLineAt(
      next,
      0,
      0,
      'Conversation compacted (ctrl+o for history)',
      stylePool.none,
    )
    prev.damage = undefined

    const renderOutput = new LogUpdate({ isTTY: true, stylePool }).render(
      makeFrame(prev),
      makeFrame(next),
    )
    const diff = renderOutput.diff

    const stdout = diff
      .filter((patch): patch is Extract<(typeof diff)[number], { type: 'stdout' }> =>
        patch.type === 'stdout',
      )
      .map(patch => patch.content)
      .join('')

    expect(stdout).toContain(' ')
    expect(diff.some(patch => patch.type === 'clearTerminal')).toBe(false)
  })

  it('emits removed tail cells when a row shrinks outside the next damage rect', () => {
    const { stylePool, screen: prev } = createTestScreen()
    const next = createScreen(
      prev.width,
      prev.height,
      stylePool,
      prev.charPool,
      prev.hyperlinkPool,
    )

    const previousText =
      'Conversation compacted (ctrl+o for history) stale tail'
    const nextText = 'Conversation compacted (ctrl+o for history)'
    writePlainAsciiLineAt(prev, 0, 0, previousText, stylePool.none)
    writePlainAsciiLineAt(next, 0, 0, nextText, stylePool.none)

    // Simulate a steady-state front buffer. The next frame only damaged its
    // newly written prefix; the old tail is represented only by contentEnd.
    prev.damage = undefined
    expect(next.damage).toEqual({
      x: 0,
      y: 0,
      width: nextText.length,
      height: 1,
    })

    const removedTail: Array<{ x: number; removed: Cell; added: Cell }> = []
    diffEach(prev, next, (x, _y, removed, added) => {
      if (x >= nextText.length && removed && added) {
        removedTail.push({ x, removed: { ...removed }, added: { ...added } })
      }
      return false
    })

    const expectedNonSpaceTail = [...previousText.slice(nextText.length)]
      .map((char, index) => ({ char, x: nextText.length + index }))
      .filter(cell => cell.char !== ' ')
    expect(removedTail.map(cell => cell.x)).toEqual(
      expectedNonSpaceTail.map(cell => cell.x),
    )
    expect(removedTail.map(cell => cell.removed.char).join('')).toBe(
      expectedNonSpaceTail.map(cell => cell.char).join(''),
    )
    expect(
      removedTail.every(
        cell =>
          cell.added.char === ' ' &&
          cell.added.width === CellWidth.Narrow &&
          cell.added.styleId === stylePool.none &&
          cell.added.hyperlink === undefined,
      ),
    ).toBe(true)
  })
})
