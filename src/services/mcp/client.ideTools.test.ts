import { describe, expect, it } from 'bun:test'
import type { Tool } from '../../Tool.js'
import { ALLOWED_IDE_TOOLS, isIncludedMcpTool } from './ideTools.js'

function createTool(name: string): Tool {
  return { name } as Tool
}

describe('IDE MCP tool allowlist', () => {
  it('includes the intended IDE tools', () => {
    expect(ALLOWED_IDE_TOOLS).toEqual([
      'mcp__ide__executeCode',
      'mcp__ide__getDiagnostics',
      'mcp__ide__getEditorContext',
      'mcp__ide__getCodeActions',
    ])
  })

  it('allows only the supported IDE MCP tools', () => {
    expect(isIncludedMcpTool(createTool('mcp__ide__executeCode'))).toBe(true)
    expect(isIncludedMcpTool(createTool('mcp__ide__getDiagnostics'))).toBe(
      true,
    )
    expect(isIncludedMcpTool(createTool('mcp__ide__getEditorContext'))).toBe(
      true,
    )
    expect(isIncludedMcpTool(createTool('mcp__ide__getCodeActions'))).toBe(
      true,
    )

    expect(isIncludedMcpTool(createTool('mcp__ide__openDiff'))).toBe(false)
    expect(isIncludedMcpTool(createTool('Read'))).toBe(true)
  })
})
