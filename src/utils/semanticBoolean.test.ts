import { describe, expect, it } from 'bun:test'
import { z } from 'zod/v4'
import { semanticBoolean } from './semanticBoolean.js'

describe('semanticBoolean', () => {
  it('accepts boolean literals and quoted boolean strings', () => {
    const schema = semanticBoolean()

    expect(schema.parse(true)).toBe(true)
    expect(schema.parse(false)).toBe(false)
    expect(schema.parse('true')).toBe(true)
    expect(schema.parse('false')).toBe(false)
  })

  it('rejects values that z.coerce.boolean would silently mis-handle', () => {
    const schema = semanticBoolean()

    expect(schema.safeParse('TRUE').success).toBe(false)
    expect(schema.safeParse('0').success).toBe(false)
    expect(schema.safeParse('').success).toBe(false)
    expect(schema.safeParse(1).success).toBe(false)
    expect(schema.safeParse(null).success).toBe(false)
  })

  it('preserves inner optional and default schemas', () => {
    expect(semanticBoolean(z.boolean().optional()).parse(undefined)).toBe(
      undefined,
    )
    expect(semanticBoolean(z.boolean().default(false)).parse(undefined)).toBe(
      false,
    )
    expect(semanticBoolean(z.boolean().default(false)).parse('true')).toBe(
      true,
    )
  })
})
