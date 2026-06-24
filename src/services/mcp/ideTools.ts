import type { Tool } from '../../Tool.js'

// For the IDE MCP servers, we only include the explicit model-facing IDE tools.
// Visibility still comes from MCP metadata (`anthropic/alwaysLoad`), not from
// hardcoded client-side special cases.
export const ALLOWED_IDE_TOOLS = [
  'mcp__ide__executeCode',
  'mcp__ide__getDiagnostics',
  'mcp__ide__getEditorContext',
  'mcp__ide__getCodeActions',
]

export function isIncludedMcpTool(tool: Tool): boolean {
  return (
    !tool.name.startsWith('mcp__ide__') || ALLOWED_IDE_TOOLS.includes(tool.name)
  )
}
