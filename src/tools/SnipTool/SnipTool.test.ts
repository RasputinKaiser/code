import { describe, expect, it } from 'bun:test'

const { SnipTool } = await import(import.meta.resolve('./SnipTool.ts'))

describe('SnipTool runtime contract', () => {
  it('is disabled in the reconstructed source build and returns the stub message', async () => {
    expect(SnipTool.isEnabled!()).toBe(false)

    const result = await SnipTool.call!()
    expect(result.data).toBe('Snip is not yet reconstructed in this source build.')
    expect(
      SnipTool.mapToolResultToToolResultBlockParam!(result.data, 'toolu_snip'),
    ).toEqual({
      type: 'tool_result',
      content: 'Snip is not yet reconstructed in this source build.',
      tool_use_id: 'toolu_snip',
    })
  })
})
