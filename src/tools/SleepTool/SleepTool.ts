import * as React from 'react'
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { Text } from '../../ink.js'
import { SLEEP_TOOL_NAME, SLEEP_TOOL_PROMPT } from './prompt.js'

const inputSchema = () => z.object({}).passthrough()
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = () => z.string().describe('Result from the sleep tool')
type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

const RESULT_TEXT = 'Sleep is not yet reconstructed in this source build.'

export const SleepTool = buildTool({
  name: SLEEP_TOOL_NAME,
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
    return 'Wait for a future proactive tick before taking more action'
  },
  async prompt() {
    return SLEEP_TOOL_PROMPT
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
    return 'Sleep unavailable'
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
