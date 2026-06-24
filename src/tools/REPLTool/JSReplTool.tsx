import { REPL_TOOL_NAME, JS_REPL_RESET_TOOL_NAME, JS_REPL_TOOL_NAME } from './constants.js'
import { createJavascriptReplTool } from './javascriptReplFactory.js'
import { getPrimaryDirectToolNames } from '../toolPolicy.js'

export const JSReplTool = createJavascriptReplTool({
  toolName: JS_REPL_TOOL_NAME,
  searchHint: 'run JavaScript in a persistent kernel',
  description:
    'Run JavaScript in a persistent Node-backed kernel for stateful analysis, scripting, and higher-order orchestration',
  prompt: [
    'Run JavaScript in a persistent Node-backed kernel with top-level await.',
    'Use js_repl when JavaScript execution, loops, shared state, or data transformation is genuinely helpful.',
    `Default first-line direct tools are: ${getPrimaryDirectToolNames().join(', ')}.`,
    'Prefer direct tools for basic repo discovery, simple file reads, simple path/content search, simple SCM status/log/diff, and single shell commands.',
    'Use await codex.tool(name, args) to call tools by name.',
    'Primitive tools such as Bash, Read, Glob, and Grep are also exposed globally by name when available for convenience.',
    'Helpers available in the kernel:',
    '- codex.cwd',
    '- codex.homeDir',
    '- codex.tmpDir',
    '- codex.tool(name, args)',
    '- codex.listTools()',
    '- callTool(name, args)',
    '- listTools()',
    'Use js_repl_reset to clear the persistent kernel state when needed.',
  ].join('\n'),
  userFacingName: 'js_repl',
  isTransparentWrapper: false,
  emitVirtualMessages: false,
  inputSchemaDescription: {
    codeDescription:
      'JavaScript code to execute in the persistent js_repl kernel. Use await at the top level and await codex.tool(...) for nested tool calls.',
  },
  forbiddenNestedToolNames: [REPL_TOOL_NAME, JS_REPL_TOOL_NAME, JS_REPL_RESET_TOOL_NAME],
})
