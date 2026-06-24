import { describe, expect, it } from 'bun:test'
import Output, { resetSharedOutputCharCachesForTesting } from './output.js'
import {
  cellAt,
  CellWidth,
  CharPool,
  HyperlinkPool,
  StylePool,
  charInCellAt,
  createScreen,
  setCellAt,
  writePlainAsciiLineAt,
} from './screen.js'
import {
  getOutputRenderStatsSnapshot,
  resetOutputRenderStatsForTesting,
} from './outputRenderStats.js'

function createOutput(stylePool: StylePool) {
  const charPool = new CharPool()
  const hyperlinkPool = new HyperlinkPool()
  const screen = createScreen(32, 1, stylePool, charPool, hyperlinkPool)
  return new Output({
    width: 32,
    height: 1,
    stylePool,
    screen,
  })
}

function readScreenRows(screen: ReturnType<typeof createScreen>): string[] {
  return Array.from({ length: screen.height }, (_, y) =>
    Array.from({ length: screen.width }, (_, x) => charInCellAt(screen, x, y) ?? ' ').join(''),
  )
}

describe('Output shared char cache', () => {
  it('reuses clustered line cache across Output instances that share a StylePool', () => {
    const stylePool = new StylePool()
    const line = '\u001b[31mhello\u001b[39m world'

    resetSharedOutputCharCachesForTesting()
    resetOutputRenderStatsForTesting()

    const firstOutput = createOutput(stylePool)
    firstOutput.write(0, 0, line)
    const firstScreen = firstOutput.get()

    expect(charInCellAt(firstScreen, 0, 0)).toBe('h')
    expect(charInCellAt(firstScreen, 10, 0)).toBe('d')

    const firstSnapshot = getOutputRenderStatsSnapshot()
    expect(firstSnapshot.totalWriteLineCalls).toBe(1)
    expect(firstSnapshot.lineCacheHits).toBe(0)
    expect(firstSnapshot.lineCacheMisses).toBe(1)

    resetOutputRenderStatsForTesting()

    const secondOutput = createOutput(stylePool)
    secondOutput.write(0, 0, line)
    const secondScreen = secondOutput.get()

    expect(charInCellAt(secondScreen, 0, 0)).toBe('h')
    expect(charInCellAt(secondScreen, 10, 0)).toBe('d')

    const secondSnapshot = getOutputRenderStatsSnapshot()
    expect(secondSnapshot.totalWriteLineCalls).toBe(1)
    expect(secondSnapshot.lineCacheHits).toBe(1)
    expect(secondSnapshot.lineCacheMisses).toBe(0)
  })

  it('does not share clustered line cache across different StylePools', () => {
    const line = '\u001b[32mcache isolation\u001b[39m'

    resetSharedOutputCharCachesForTesting()

    const firstOutput = createOutput(new StylePool())
    firstOutput.write(0, 0, line)
    firstOutput.get()

    resetOutputRenderStatsForTesting()

    const secondOutput = createOutput(new StylePool())
    secondOutput.write(0, 0, line)
    secondOutput.get()

    const snapshot = getOutputRenderStatsSnapshot()
    expect(snapshot.totalWriteLineCalls).toBe(1)
    expect(snapshot.lineCacheHits).toBe(0)
    expect(snapshot.lineCacheMisses).toBe(1)
  })

  it('drops shared cache contents after an explicit shared-cache reset', () => {
    const stylePool = new StylePool()
    const line = '\u001b[34mreset me\u001b[39m'

    resetSharedOutputCharCachesForTesting()

    const firstOutput = createOutput(stylePool)
    firstOutput.write(0, 0, line)
    firstOutput.get()

    resetSharedOutputCharCachesForTesting()
    resetOutputRenderStatsForTesting()

    const secondOutput = createOutput(stylePool)
    secondOutput.write(0, 0, line)
    secondOutput.get()

    const snapshot = getOutputRenderStatsSnapshot()
    expect(snapshot.totalWriteLineCalls).toBe(1)
    expect(snapshot.lineCacheHits).toBe(0)
    expect(snapshot.lineCacheMisses).toBe(1)
  })

  it('uses the plain ASCII fast path for simple no-ANSI lines', () => {
    const stylePool = new StylePool()
    const line = 'plain ascii code line 123'

    resetSharedOutputCharCachesForTesting()
    resetOutputRenderStatsForTesting()

    const output = createOutput(stylePool)
    output.write(0, 0, line)
    const screen = output.get()

    expect(charInCellAt(screen, 0, 0)).toBe('p')
    expect(charInCellAt(screen, line.length - 1, 0)).toBe('3')

    const snapshot = getOutputRenderStatsSnapshot()
    expect(snapshot.totalWriteLineCalls).toBe(1)
    expect(snapshot.lineCacheHits).toBe(0)
    expect(snapshot.lineCacheMisses).toBe(1)
    expect(snapshot.plainAsciiMaterializeCount).toBe(1)
    expect(snapshot.tokenizedMaterializeCount).toBe(0)
  })

  it('falls back to tokenized materialization for ANSI lines', () => {
    const stylePool = new StylePool()
    const line = '\u001b[31mansi line\u001b[39m'

    resetSharedOutputCharCachesForTesting()
    resetOutputRenderStatsForTesting()

    const output = createOutput(stylePool)
    output.write(0, 0, line)
    const screen = output.get()

    expect(charInCellAt(screen, 0, 0)).toBe('a')
    expect(charInCellAt(screen, 8, 0)).toBe('e')

    const snapshot = getOutputRenderStatsSnapshot()
    expect(snapshot.totalWriteLineCalls).toBe(1)
    expect(snapshot.lineCacheHits).toBe(0)
    expect(snapshot.lineCacheMisses).toBe(1)
    expect(snapshot.plainAsciiMaterializeCount).toBe(0)
    expect(snapshot.tokenizedMaterializeCount).toBe(1)
  })

  it('writeLines matches write for multi-line ANSI content', () => {
    const stylePool = new StylePool()
    const charPool = new CharPool()
    const hyperlinkPool = new HyperlinkPool()
    const screenFromWrite = createScreen(12, 2, stylePool, charPool, hyperlinkPool)
    const screenFromWriteLines = createScreen(12, 2, stylePool, charPool, hyperlinkPool)
    const line1 = '\u001b[31mhello\u001b[39m'
    const line2 = 'world'

    const joinedOutput = new Output({
      width: 12,
      height: 2,
      stylePool,
      screen: screenFromWrite,
    })
    joinedOutput.write(0, 0, `${line1}\n${line2}`)

    const splitOutput = new Output({
      width: 12,
      height: 2,
      stylePool,
      screen: screenFromWriteLines,
    })
    splitOutput.writeLines(0, 0, [line1, line2])

    expect(readScreenRows(joinedOutput.get())).toEqual(
      readScreenRows(splitOutput.get()),
    )
  })

  it('writeLines matches write when clipping multi-line ANSI content', () => {
    const stylePool = new StylePool()
    const charPool = new CharPool()
    const hyperlinkPool = new HyperlinkPool()
    const screenFromWrite = createScreen(8, 2, stylePool, charPool, hyperlinkPool)
    const screenFromWriteLines = createScreen(8, 2, stylePool, charPool, hyperlinkPool)
    const line1 = '\u001b[31mabcde\u001b[39m'
    const line2 = '\u001b[32mvwxyz\u001b[39m'
    const clip = { x1: 1, x2: 4, y1: 0, y2: 2 }

    const joinedOutput = new Output({
      width: 8,
      height: 2,
      stylePool,
      screen: screenFromWrite,
    })
    joinedOutput.clip(clip)
    joinedOutput.write(0, 0, `${line1}\n${line2}`)

    const splitOutput = new Output({
      width: 8,
      height: 2,
      stylePool,
      screen: screenFromWriteLines,
    })
    splitOutput.clip(clip)
    splitOutput.writeLines(0, 0, [line1, line2])

    expect(readScreenRows(joinedOutput.get())).toEqual(
      readScreenRows(splitOutput.get()),
    )
  })

  it('preserves output when a full-width ANSI block already fits within the horizontal clip', () => {
    const stylePool = new StylePool()
    const charPool = new CharPool()
    const hyperlinkPool = new HyperlinkPool()
    const unclippedScreen = createScreen(12, 2, stylePool, charPool, hyperlinkPool)
    const clippedScreen = createScreen(12, 2, stylePool, charPool, hyperlinkPool)
    const lines = ['\u001b[31mhello\u001b[39m', '\u001b[32mworld\u001b[39m']
    const clip = { x1: 1, x2: 10, y1: 0, y2: 2 }

    const unclippedOutput = new Output({
      width: 12,
      height: 2,
      stylePool,
      screen: unclippedScreen,
    })
    unclippedOutput.writeLines(2, 0, lines)

    const clippedOutput = new Output({
      width: 12,
      height: 2,
      stylePool,
      screen: clippedScreen,
    })
    clippedOutput.clip(clip)
    clippedOutput.writeLines(2, 0, lines)

    expect(readScreenRows(clippedOutput.get())).toEqual(
      readScreenRows(unclippedOutput.get()),
    )
  })

  it('writePlainAsciiLineAt clears a wide cell spacer tail when overwritten by a narrow write', () => {
    const stylePool = new StylePool()
    const charPool = new CharPool()
    const hyperlinkPool = new HyperlinkPool()
    const screen = createScreen(6, 1, stylePool, charPool, hyperlinkPool)

    setCellAt(screen, 1, 0, {
      char: '本',
      styleId: stylePool.none,
      width: CellWidth.Wide,
      hyperlink: undefined,
    })

    writePlainAsciiLineAt(screen, 1, 0, 'a', stylePool.none)

    expect(charInCellAt(screen, 1, 0)).toBe('a')
    expect(charInCellAt(screen, 2, 0)).toBe(' ')
    expect(cellAt(screen, 2, 0)?.width).toBe(CellWidth.Narrow)
  })

  it('writePlainAsciiLineAt clears an orphaned wide head when overwriting a spacer tail', () => {
    const stylePool = new StylePool()
    const charPool = new CharPool()
    const hyperlinkPool = new HyperlinkPool()
    const screen = createScreen(6, 1, stylePool, charPool, hyperlinkPool)

    setCellAt(screen, 1, 0, {
      char: '本',
      styleId: stylePool.none,
      width: CellWidth.Wide,
      hyperlink: undefined,
    })

    writePlainAsciiLineAt(screen, 2, 0, 'b', stylePool.none)

    expect(charInCellAt(screen, 1, 0)).toBe(' ')
    expect(cellAt(screen, 1, 0)?.width).toBe(CellWidth.Narrow)
    expect(charInCellAt(screen, 2, 0)).toBe('b')
    expect(cellAt(screen, 2, 0)?.width).toBe(CellWidth.Narrow)
  })

  it('writePlainAsciiLineAt keeps contentEnd in sync with visible ASCII writes', () => {
    const stylePool = new StylePool()
    const charPool = new CharPool()
    const hyperlinkPool = new HyperlinkPool()
    const screen = createScreen(20, 1, stylePool, charPool, hyperlinkPool)

    writePlainAsciiLineAt(screen, 0, 0, 'abcdefghijklmnop', stylePool.none)

    expect(charInCellAt(screen, 0, 0)).toBe('a')
    expect(charInCellAt(screen, 15, 0)).toBe('p')
    expect(screen.contentEnd[0]).toBe(16)
  })
})
