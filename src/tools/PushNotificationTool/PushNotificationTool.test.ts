import { describe, expect, it } from 'bun:test'

const { PushNotificationTool } = await import(
  import.meta.resolve('./PushNotificationTool.ts')
)

describe('PushNotificationTool runtime contract', () => {
  it('is disabled in the reconstructed source build and returns the stub message', async () => {
    expect(PushNotificationTool.isEnabled!()).toBe(false)

    const result = await PushNotificationTool.call!()
    expect(result.data).toBe(
      'PushNotification is not yet reconstructed in this source build.',
    )
    expect(
      PushNotificationTool.mapToolResultToToolResultBlockParam!(
        result.data,
        'toolu_push_notification',
      ),
    ).toEqual({
      type: 'tool_result',
      content: 'PushNotification is not yet reconstructed in this source build.',
      tool_use_id: 'toolu_push_notification',
    })
  })
})
