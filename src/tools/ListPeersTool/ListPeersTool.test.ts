import { describe, expect, it } from 'bun:test'

const { ListPeersTool } = await import(import.meta.resolve('./ListPeersTool.ts'))

describe('ListPeersTool runtime contract', () => {
  it('is disabled in the reconstructed source build and returns the stub message', async () => {
    expect(ListPeersTool.isEnabled!()).toBe(false)

    const result = await ListPeersTool.call!()
    expect(result.data).toBe(
      'ListPeers is not yet reconstructed in this source build.',
    )
    expect(
      ListPeersTool.mapToolResultToToolResultBlockParam!(
        result.data,
        'toolu_list_peers',
      ),
    ).toEqual({
      type: 'tool_result',
      content: 'ListPeers is not yet reconstructed in this source build.',
      tool_use_id: 'toolu_list_peers',
    })
  })
})
