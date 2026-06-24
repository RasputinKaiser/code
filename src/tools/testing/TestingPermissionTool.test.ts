import { describe, expect, it } from 'bun:test'

const { TestingPermissionTool } = await import(
  import.meta.resolve('./TestingPermissionTool.tsx'),
)

describe('TestingPermissionTool runtime contract', () => {
  it('always asks for permission and returns a stable success payload', async () => {
    const decision = await TestingPermissionTool.checkPermissions!()
    const result = await TestingPermissionTool.call!()

    expect(decision).toEqual({
      behavior: 'ask',
      message: 'Run test?',
    })
    expect(result.data).toBe('TestingPermission executed successfully')
    expect(
      TestingPermissionTool.mapToolResultToToolResultBlockParam!(
        result.data,
        'toolu_testing',
      ),
    ).toEqual({
      type: 'tool_result',
      content: 'TestingPermission executed successfully',
      tool_use_id: 'toolu_testing',
    })
  })
})
