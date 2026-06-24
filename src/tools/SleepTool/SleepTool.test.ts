import { describe, expect, it } from 'bun:test'

const { SleepTool } = await import(import.meta.resolve('./SleepTool.ts'))

describe('SleepTool runtime contract', () => {
  it('is disabled in the reconstructed source build and returns the stub message', async () => {
    expect(SleepTool.isEnabled!()).toBe(false)

    const result = await SleepTool.call!()
    expect(result.data).toBe(
      'Sleep is not yet reconstructed in this source build.',
    )
    expect(
      SleepTool.mapToolResultToToolResultBlockParam!(
        result.data,
        'toolu_sleep',
      ),
    ).toEqual({
      type: 'tool_result',
      content: 'Sleep is not yet reconstructed in this source build.',
      tool_use_id: 'toolu_sleep',
    })
  })
})
