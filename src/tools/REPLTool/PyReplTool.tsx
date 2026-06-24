import {
  JS_REPL_RESET_TOOL_NAME,
  JS_REPL_TOOL_NAME,
  PY_REPL_RESET_TOOL_NAME,
  PY_REPL_TOOL_NAME,
  REPL_TOOL_NAME,
} from './constants.js'
import { createPythonReplTool } from './pyReplFactory.js'
import { getPrimaryDirectToolNames } from '../toolPolicy.js'

export const PyReplTool = createPythonReplTool({
  toolName: PY_REPL_TOOL_NAME,
  searchHint: 'run Python in a persistent kernel',
  description:
    'Run Python in a persistent kernel for stateful analysis, scripting, loops, and higher-order orchestration',
  prompt: [
    'Run Python in a persistent kernel with top-level await.',
    'Use py_repl when Python execution, loops, shared state, data transformation, or lightweight analysis is genuinely helpful.',
    `Default first-line direct tools are: ${getPrimaryDirectToolNames().join(', ')}.`,
    'Prefer direct tools for basic repo discovery, simple file reads, simple path/content search, simple SCM status/log/diff, and single shell commands.',
    'Use await codex.tool(name, args) to call tools by name.',
    'Helpers available in the kernel:',
    '- codex.tmpDir',
    '- codex.tool(name, args)',
    '- tmpDir',
    'Use py_repl_reset to clear the persistent Python kernel state when needed.',
  ].join('\n'),
  userFacingName: 'py_repl',
  inputSchemaDescription: {
    codeDescription:
      'Python code to execute in the persistent py_repl kernel. Top-level await is supported. Use await codex.tool(...) for nested tool calls. You may also set timeout with a first line like `# codex-py-repl: timeout_ms=15000`.',
  },
  forbiddenNestedToolNames: [
    REPL_TOOL_NAME,
    JS_REPL_TOOL_NAME,
    JS_REPL_RESET_TOOL_NAME,
    PY_REPL_TOOL_NAME,
    PY_REPL_RESET_TOOL_NAME,
  ],
})
