import { describe, expect, it } from 'bun:test'
import { JSONLParseError, parseJSONL } from './json.js'

describe('parseJSONL', () => {
  it('keeps tolerant default behavior by skipping malformed lines', () => {
    const values = parseJSONL<{ id: number }>([
      JSON.stringify({ id: 1 }),
      '{not valid json',
      JSON.stringify({ id: 2 }),
    ].join('\n'))

    expect(values).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('throws JSONLParseError with line number in strict mode for strings', () => {
    let error: unknown
    try {
      parseJSONL([
        JSON.stringify({ id: 1 }),
        '{not valid json',
      ].join('\n'), { strict: true })
    } catch (e) {
      error = e
    }

    expect(error).toBeInstanceOf(JSONLParseError)
    expect((error as JSONLParseError).line).toBe(2)
  })

  it('throws JSONLParseError with line number in strict mode for buffers', () => {
    let error: unknown
    try {
      parseJSONL(Buffer.from([
        JSON.stringify({ id: 1 }),
        '{not valid json',
      ].join('\n')), { strict: true })
    } catch (e) {
      error = e
    }

    expect(error).toBeInstanceOf(JSONLParseError)
    expect((error as JSONLParseError).line).toBe(2)
  })
})
