import * as React from 'react'
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { Text } from '../../ink.js'

const inputSchema = () => z.object({}).passthrough()
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = () =>
  z.string().describe('Result from the peer-session listing tool')
type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

const RESULT_TEXT =
  'ListPeers is not yet reconstructed in this source build.'

export const ListPeersTool = buildTool({
  name: 'ListPeers',
  maxResultSizeChars: 8_000,
  isEnabled() {
    return false
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  async description() {
    return 'List available peer sessions'
  },
  async prompt() {
    return RESULT_TEXT
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  async call() {
    return { data: RESULT_TEXT }
  },
  renderToolUseMessage() {
    return 'ListPeers unavailable'
  },
  renderToolResultMessage(output: Output) {
    return React.createElement(Text, {}, output)
  },
  mapToolResultToToolResultBlockParam(content: Output, toolUseID: string) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content,
    }
  },
} satisfies ToolDef<InputSchema, Output>)
