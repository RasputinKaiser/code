import * as React from 'react'
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { Text } from '../../ink.js'
import { DESCRIPTION, PROMPT, SNIP_TOOL_NAME } from './prompt.js'

const inputSchema = () => z.object({}).passthrough()
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = () => z.string().describe('Result from the snip tool')
type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

const RESULT_TEXT = 'Snip is not yet reconstructed in this source build.'

export const SnipTool = buildTool({
  name: SNIP_TOOL_NAME,
  maxResultSizeChars: 8_000,
  isEnabled() {
    return false
  },
  isConcurrencySafe() {
    return true
  },
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
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
    return 'Snip unavailable'
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
