import { describe, expect, it } from 'bun:test'
import { serializeOptimizedToAnsiForTesting } from './renderTrace.js'
import { cursorMove, cursorTo, eraseLines } from './termio/csi.js'
import { HIDE_CURSOR, SHOW_CURSOR } from './termio/dec.js'
import { link } from './termio/osc.js'

describe('renderTrace', () => {
  it('serializes optimized patches with the same payload fields as terminal writes', () => {
    const ansi = serializeOptimizedToAnsiForTesting([
      { type: 'stdout', content: 'hello' },
      { type: 'styleStr', str: '\x1b[31m' },
      { type: 'clear', count: 2 },
      { type: 'cursorHide' },
      { type: 'cursorShow' },
      { type: 'cursorMove', x: 3, y: -1 },
      { type: 'cursorTo', col: 5 },
      { type: 'carriageReturn' },
      { type: 'hyperlink', uri: 'https://example.test' },
    ])

    expect(ansi).toContain('hello')
    expect(ansi).toContain('\x1b[31m')
    expect(ansi).toContain(eraseLines(2))
    expect(ansi).toContain(HIDE_CURSOR)
    expect(ansi).toContain(SHOW_CURSOR)
    expect(ansi).toContain(cursorMove(3, -1))
    expect(ansi).toContain(cursorTo(5))
    expect(ansi).toContain('\r')
    expect(ansi).toContain(link('https://example.test'))
  })
})
