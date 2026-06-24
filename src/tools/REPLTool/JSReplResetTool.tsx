import React from 'react'
import { z } from 'zod/v4'
import { MessageResponse } from '../../components/MessageResponse.js'
import { Text } from '../../ink.js'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { clearJavascriptReplContext } from './javascriptReplFactory.js'
import { JS_REPL_RESET_TOOL_NAME, JS_REPL_TOOL_NAME } from './constants.js'

const inputSchema = lazySchema(() => z.strictObject({}))
const outputSchema = lazySchema(() =>
  z.strictObject({
    reset: z.boolean(),
  }),
)

export const JSReplResetTool = buildTool({
  name: JS_REPL_RESET_TOOL_NAME,
  searchHint: 'reset the persistent js_repl kernel state',
  async description() {
    return 'Reset the persistent js_repl kernel state'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  isReadOnly() {
    return false
  },
  async prompt() {
    return 'Clear the persistent js_repl kernel state when the user explicitly wants a clean JavaScript runtime.'
  },
  userFacingName() {
    return 'js_repl_reset'
  },
  renderToolUseMessage() {
    return 'reset kernel'
  },
  renderToolResultMessage(result) {
    return (
      <MessageResponse height={1}>
        <Text>{result.reset ? 'js_repl kernel reset' : 'js_repl kernel unchanged'}</Text>
      </MessageResponse>
    )
  },
  async call(_input, toolUseContext) {
    clearJavascriptReplContext(toolUseContext, JS_REPL_TOOL_NAME)
    return {
      data: {
        reset: true,
      },
    }
  },
})
