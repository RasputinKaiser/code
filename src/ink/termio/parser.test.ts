import { describe, expect, it } from 'bun:test'
import { Parser } from './parser.js'
import { defaultStyle } from './types.js'

describe('Parser text segmentation', () => {
  it('segments plain ASCII text without changing grapheme semantics', () => {
    const parser = new Parser()

    expect(parser.feed('abc')).toEqual([
      {
        type: 'text',
        graphemes: [
          { value: 'a', width: 1 },
          { value: 'b', width: 1 },
          { value: 'c', width: 1 },
        ],
        style: defaultStyle(),
      },
    ])
  })

  it('preserves wide and multi-codepoint graphemes on the unicode path', () => {
    const parser = new Parser()

    expect(parser.feed('a😀界')).toEqual([
      {
        type: 'text',
        graphemes: [
          { value: 'a', width: 1 },
          { value: '😀', width: 2 },
          { value: '界', width: 2 },
        ],
        style: defaultStyle(),
      },
    ])
  })

  it('keeps CRLF as terminal controls on the unicode path', () => {
    const parser = new Parser()

    expect(parser.feed('✻ row\r\nnext')).toEqual([
      {
        type: 'text',
        graphemes: [
          { value: '✻', width: 2 },
          { value: ' ', width: 1 },
          { value: 'r', width: 1 },
          { value: 'o', width: 1 },
          { value: 'w', width: 1 },
          { value: '\r', width: 1 },
          { value: '\n', width: 1 },
          { value: 'n', width: 1 },
          { value: 'e', width: 1 },
          { value: 'x', width: 1 },
          { value: 't', width: 1 },
        ],
        style: defaultStyle(),
      },
    ])
  })
})
