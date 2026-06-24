import { describe, expect, it } from 'bun:test'
import { GrepTool } from './GrepTool.js'

describe('GrepTool.validateInput', () => {
  it('rejects filename discovery patterns', async () => {
    const result = await GrepTool.validateInput({
      pattern: 'package\\.json',
      output_mode: 'files_with_matches',
    })

    expect(result.result).toBe(false)
    expect(result.message).toContain('Use Glob')
  })

  it('rejects filename alternations used as discovery queries', async () => {
    const result = await GrepTool.validateInput({
      pattern: 'cli\\.ts|index\\.ts|main\\.ts',
    })

    expect(result.result).toBe(false)
    expect(result.message).toContain('Use Glob')
  })

  it('allows real content searches', async () => {
    const result = await GrepTool.validateInput({
      pattern: 'function\\s+main',
    })

    expect(result).toEqual({ result: true })
  })

  it('allows literal dotted content search in content mode', async () => {
    const result = await GrepTool.validateInput({
      pattern: 'package\\.json',
      output_mode: 'content',
    })

    expect(result).toEqual({ result: true })
  })
})
