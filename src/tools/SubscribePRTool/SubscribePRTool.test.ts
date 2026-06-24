import { describe, expect, it } from 'bun:test'

const { SubscribePRTool } = await import(
  import.meta.resolve('./SubscribePRTool.ts')
)

describe('SubscribePRTool runtime contract', () => {
  it('is disabled in the reconstructed source build and returns the stub message', async () => {
    expect(SubscribePRTool.isEnabled!()).toBe(false)

    const result = await SubscribePRTool.call!()
    expect(result.data).toBe(
      'SubscribePR is not yet reconstructed in this source build.',
    )
    expect(
      SubscribePRTool.mapToolResultToToolResultBlockParam!(
        result.data,
        'toolu_subscribe_pr',
      ),
    ).toEqual({
      type: 'tool_result',
      content: 'SubscribePR is not yet reconstructed in this source build.',
      tool_use_id: 'toolu_subscribe_pr',
    })
  })
})
