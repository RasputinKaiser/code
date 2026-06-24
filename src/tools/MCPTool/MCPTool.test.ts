import { describe, expect, it } from 'bun:test'

const { MCPTool } = await import(import.meta.resolve('./MCPTool.ts'))

describe('MCPTool runtime contract', () => {
  it('keeps the generic MCP shim behavior stable in the reconstructed source build', async () => {
    const permission = await MCPTool.checkPermissions!({})
    expect(permission).toEqual({
      behavior: 'passthrough',
      message: 'MCPTool requires permission.',
    })

    const result = await MCPTool.call!({})
    expect(result.data).toBe('')
    expect(MCPTool.userFacingName!()).toBe('mcp')
    expect(MCPTool.mapToolResultToToolResultBlockParam!('', 'toolu_mcp')).toEqual(
      {
        type: 'tool_result',
        content: '',
        tool_use_id: 'toolu_mcp',
      },
    )
  })
})
