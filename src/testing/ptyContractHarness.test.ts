import { describe, expect, test } from 'bun:test'
import { normalizePtyVisibleText } from './ptyContractHarness.js'

describe('normalizePtyVisibleText', () => {
  test('removes private-mode keyboard and terminal identity queries from PTY output', () => {
    const raw =
      '\x1b[>1u\x1b[>4;2m\x1b[>0q' +
      '◉ /data/models/hf/moonshotai__Kimi-K2.7-Code · high  ⌂ /mlstore/src/noumena/ncode/code'

    expect(normalizePtyVisibleText(raw)).toBe(
      '◉ /data/models/hf/moonshotai__Kimi-K2.7-Code · high  ⌂ /mlstore/src/noumena/ncode/code',
    )
  })

  test('preserves visible text while normalizing carriage returns', () => {
    const raw = '❯ alpha\r\nbeta\rdelta'

    expect(normalizePtyVisibleText(raw)).toBe('❯ alpha\r\nbeta\ndelta')
  })
})
