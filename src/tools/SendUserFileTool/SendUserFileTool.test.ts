import { describe, expect, it } from 'bun:test'

const { SendUserFileTool } = await import(
  import.meta.resolve('./SendUserFileTool.ts')
)

describe('SendUserFileTool runtime contract', () => {
  it('is disabled in the reconstructed source build and returns the stub message', async () => {
    expect(SendUserFileTool.isEnabled!()).toBe(false)

    const result = await SendUserFileTool.call!()
    expect(result.data).toBe(
      'SendUserFile is not yet reconstructed in this source build.',
    )
    expect(
      SendUserFileTool.mapToolResultToToolResultBlockParam!(
        result.data,
        'toolu_send_user_file',
      ),
    ).toEqual({
      type: 'tool_result',
      content: 'SendUserFile is not yet reconstructed in this source build.',
      tool_use_id: 'toolu_send_user_file',
    })
  })
})
