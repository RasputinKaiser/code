import React from 'react'
import { z } from 'zod/v4'
import { MessageResponse } from '../../components/MessageResponse.js'
import { Text } from '../../ink.js'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { PY_REPL_RESET_TOOL_NAME, PY_REPL_TOOL_NAME } from './constants.js'
import { clearPythonReplContext } from './pyReplFactory.js'

const inputSchema = lazySchema(() => z.strictObject({}))
const outputSchema = lazySchema(() =>
  z.strictObject({
    reset: z.boolean(),
  }),
)

export const PyReplResetTool = buildTool({
  name: PY_REPL_RESET_TOOL_NAME,
  searchHint: 'reset the persistent py_repl kernel state',
  async description() {
    return 'Reset the persistent py_repl kernel state'
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
    return 'Clear the persistent py_repl kernel state when the user explicitly wants a clean Python runtime.'
  },
  userFacingName() {
    return 'py_repl_reset'
  },
  renderToolUseMessage() {
    return 'reset kernel'
  },
  renderToolResultMessage(result) {
    return (
      <MessageResponse height={1}>
        <Text>{result.reset ? 'py_repl kernel reset' : 'py_repl kernel unchanged'}</Text>
      </MessageResponse>
    )
  },
  async call(_input, toolUseContext) {
    await clearPythonReplContext(toolUseContext, PY_REPL_TOOL_NAME)
    return {
      data: {
        reset: true,
      },
    }
  },
})
