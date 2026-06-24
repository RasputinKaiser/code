import { describe, expect, it } from 'bun:test'
import { z } from 'zod/v4'
import { semanticNumber } from './semanticNumber.js'

describe('semanticNumber', () => {
  it('accepts numbers and quoted decimal number literals', () => {
    const schema = semanticNumber()

    expect(schema.parse(30)).toBe(30)
    expect(schema.parse('30')).toBe(30)
    expect(schema.parse('-5')).toBe(-5)
    expect(schema.parse('3.14')).toBe(3.14)
  })

  it('rejects strings outside the documented decimal literal contract', () => {
    const schema = semanticNumber()

    expect(schema.safeParse('').success).toBe(false)
    expect(schema.safeParse(null).success).toBe(false)
    expect(schema.safeParse('1e3').success).toBe(false)
    expect(schema.safeParse('.5').success).toBe(false)
    expect(schema.safeParse('5.').success).toBe(false)
    expect(schema.safeParse('+1').success).toBe(false)
  })

  it('preserves inner optional and default schemas', () => {
    expect(semanticNumber(z.number().optional()).parse(undefined)).toBe(
      undefined,
    )
    expect(semanticNumber(z.number().default(7)).parse(undefined)).toBe(7)
    expect(semanticNumber(z.number().default(7)).parse('9')).toBe(9)
  })
})
