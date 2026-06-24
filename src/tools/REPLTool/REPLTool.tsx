import { REPL_TOOL_NAME } from './constants.js'
import { getReplPrimitiveTools } from './primitiveTools.js'
import { createJavascriptReplTool } from './javascriptReplFactory.js'
import { getPrimaryDirectToolNames } from '../toolPolicy.js'

export const REPLTool = createJavascriptReplTool({
  toolName: REPL_TOOL_NAME,
  searchHint: 'run JavaScript that orchestrates hidden primitive tools',
  description:
    'Execute JavaScript in a persistent VM context for orchestration-specific multi-step tool work and shared state',
  prompt: () =>
    [
      'Execute JavaScript in a persistent VM context.',
      'Use REPL as a high-power orchestration tool when you need multi-step control flow, loops, shared state, or to coordinate several primitive tool calls inside the TUI REPL.',
      `Default first-line direct tools are: ${getPrimaryDirectToolNames().join(', ')}.`,
      'Prefer direct tools for single-step actions. Do NOT use REPL for basic repo discovery, simple file reads, simple path/content searches, simple SCM status/log/diff, or single Bash commands when a direct tool can do the job clearly.',
      'If js_repl is available and you want a general-purpose JavaScript kernel, prefer js_repl; use REPL when the work is specifically about orchestrating the product tool surface.',
      'Available primitive tool functions are exposed globally by name and can be awaited:',
      getReplPrimitiveTools()
        .map(tool => tool.name)
        .join(', '),
      'Use await for tool calls (example: await Bash({ command: "sl status" })).',
      'State persists across REPL calls through the VM global context.',
    ].join('\n'),
  userFacingName: 'REPL',
  isTransparentWrapper: true,
  emitVirtualMessages: true,
  inputSchemaDescription: {
    codeDescription:
      'JavaScript code to execute in the persistent REPL VM context. Use await when calling tool functions.',
  },
  forbiddenNestedToolNames: [REPL_TOOL_NAME, 'js_repl', 'js_repl_reset'],
})
