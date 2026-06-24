import { describe, expect, it } from 'bun:test'
import { GlobTool } from './GlobTool.js'

describe('GlobTool input schema compatibility', () => {
  it('accepts output_mode as an ignored compatibility field', () => {
    const parsed = GlobTool.inputSchema.parse({
      pattern: 'code/**/*',
      output_mode: 'files_with_matches',
    })

    expect(parsed).toEqual({
      pattern: 'code/**/*',
      output_mode: 'files_with_matches',
    })
  })

  it('still rejects unexpected extra fields', () => {
    expect(() =>
      GlobTool.inputSchema.parse({
        pattern: 'code/**/*',
        unexpected_field: true,
      }),
    ).toThrow()
  })
})
