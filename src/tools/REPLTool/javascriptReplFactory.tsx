import { randomUUID } from 'crypto'
import { homedir, tmpdir } from 'os'
import { type Context, createContext, Script } from 'node:vm'
import { inspect } from 'node:util'
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import React from 'react'
import { z } from 'zod/v4'
import { MessageResponse } from '../../components/MessageResponse.js'
import { Text } from '../../ink.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import {
  buildTool,
  type Tool,
  type ToolCallProgress,
  type ToolDef,
  type ToolUseContext,
} from '../../Tool.js'
import type {
  AssistantMessage,
  Message,
  ProgressMessage,
} from '../../types/message.js'
import type { PermissionResult } from '../../utils/permissions/PermissionResult.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { getReplPrimitiveTools } from './primitiveTools.js'
import {
  createToolWrapper,
  type ReplToolCallProgress,
  type ReplToolCallSummary,
} from './toolWrappers.js'

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_TIMEOUT_MS = 120_000
const PREVIEW_LIMIT = 20_000

type RegisteredTool = {
  name: string
  description: string
  schema: Record<string, unknown>
  handler: (args: Record<string, unknown>) => Promise<unknown>
}

type CapturedConsole = {
  log: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
  getStdout: () => string
  getStderr: () => string
  clear: () => void
}

export type JavascriptReplStoreContext = {
  vmContext: Context
  registeredTools: Map<string, RegisteredTool>
  console: CapturedConsole
}

type InputSchemaDescription = {
  codeDescription: string
}

type OutputSchema = ReturnType<typeof buildOutputSchema>
type Output = z.infer<OutputSchema>

export type JavascriptReplToolConfig = {
  toolName: string
  searchHint: string
  description: string
  prompt: string | (() => string)
  userFacingName: string
  isTransparentWrapper: boolean
  emitVirtualMessages: boolean
  directGlobalTools?: readonly Tool[]
  inputSchemaDescription: InputSchemaDescription
  forbiddenNestedToolNames?: readonly string[]
}

function buildInputSchema(description: InputSchemaDescription) {
  return lazySchema(() =>
    z.strictObject({
      code: z.string().describe(description.codeDescription),
      timeout_ms: z
        .number()
        .int()
        .min(1)
        .max(MAX_TIMEOUT_MS)
        .optional()
        .default(DEFAULT_TIMEOUT_MS)
        .describe(`Maximum execution time in milliseconds (1-${MAX_TIMEOUT_MS})`),
    }),
  )
}

function buildOutputSchema() {
  return lazySchema(() =>
    z.object({
      result: z.unknown().optional(),
      stdout: z.string(),
      stderr: z.string(),
      error: z.string().optional(),
      toolCalls: z.array(
        z.object({
          toolName: z.string(),
          toolInput: z.record(z.string(), z.unknown()),
          success: z.boolean(),
          result: z.unknown().optional(),
          error: z.string().optional(),
        }),
      ),
    }),
  )
}

function ensureRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  try {
    return (
      jsonStringify(value, null, 2) ??
      inspect(value, {
        depth: 6,
      })
    )
  } catch {
    return inspect(value, {
      depth: 6,
    })
  }
}

function preview(value: string, maxChars: number = PREVIEW_LIMIT): string {
  if (value.length <= maxChars) {
    return value
  }
  return `${value.slice(0, maxChars)}\n...[truncated ${value.length - maxChars} chars]`
}

function formatConsoleArgs(args: unknown[]): string {
  return args
    .map(arg => {
      if (typeof arg === 'string') {
        return arg
      }
      return inspect(arg, {
        depth: 6,
      })
    })
    .join(' ')
}

function createCapturedConsole(): CapturedConsole {
  const stdout: string[] = []
  const stderr: string[] = []
  const writeStdout = (...args: unknown[]) => {
    stdout.push(formatConsoleArgs(args))
  }
  const writeStderr = (...args: unknown[]) => {
    stderr.push(formatConsoleArgs(args))
  }
  return {
    log: writeStdout,
    info: writeStdout,
    debug: writeStdout,
    warn: writeStderr,
    error: writeStderr,
    getStdout: () => stdout.join('\n'),
    getStderr: () => stderr.join('\n'),
    clear: () => {
      stdout.length = 0
      stderr.length = 0
    },
  }
}

function createVmExecutionContext(capturedConsole: CapturedConsole): Context {
  const vmContext = createContext({
    console: capturedConsole,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    AbortController,
    Buffer,
  })
  ;(vmContext as Record<string, unknown>).globalThis = vmContext
  return vmContext
}

function getOrCreateJavascriptReplContext(
  toolUseContext: ToolUseContext,
  toolName: string,
): JavascriptReplStoreContext {
  const existing = toolUseContext.getAppState().javascriptReplContexts?.get(
    toolName,
  )
  if (existing) {
    return existing
  }
  const capturedConsole = createCapturedConsole()
  const created: JavascriptReplStoreContext = {
    vmContext: createVmExecutionContext(capturedConsole),
    registeredTools: new Map<string, RegisteredTool>(),
    console: capturedConsole,
  }
  toolUseContext.setAppState(prev => {
    const contexts = new Map(prev.javascriptReplContexts ?? [])
    contexts.set(toolName, created)
    return {
      ...prev,
      javascriptReplContexts: contexts,
    }
  })
  return created
}

export function clearJavascriptReplContext(
  toolUseContext: ToolUseContext,
  toolName: string,
): void {
  toolUseContext.setAppState(prev => {
    if (!prev.javascriptReplContexts?.has(toolName)) {
      return prev
    }
    const contexts = new Map(prev.javascriptReplContexts)
    contexts.delete(toolName)
    return {
      ...prev,
      javascriptReplContexts: contexts,
    }
  })
}

function isSafeIdentifier(name: string): boolean {
  return /^[$A-Z_a-z][$\w]*$/.test(name)
}

function ensureRuntimeHelpers(
  replContext: JavascriptReplStoreContext,
): void {
  const globals = replContext.vmContext as Record<string, unknown>

  const callTool = async (name: string, args?: Record<string, unknown>) => {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('callTool(name, args) requires a non-empty tool name')
    }
    const tool = replContext.registeredTools.get(name)
    if (!tool) {
      throw new Error(`Unknown JavaScript REPL tool: ${name}`)
    }
    return tool.handler(ensureRecord(args))
  }

  const listTools = () =>
    [...replContext.registeredTools.values()].map(tool => ({
      name: tool.name,
      description: tool.description,
      schema: tool.schema,
    }))

  globals.console = replContext.console
  globals.callTool = callTool
  globals.listTools = listTools
  globals.codex = {
    cwd: process.cwd(),
    homeDir: homedir(),
    tmpDir: tmpdir(),
    tool: callTool,
    listTools,
  }
}

function augmentToolsForJavascriptRepl(toolUseContext: ToolUseContext): Tool[] {
  const byName = new Map<string, Tool>()
  for (const tool of toolUseContext.options.tools) {
    byName.set(tool.name, tool)
  }
  for (const tool of getReplPrimitiveTools()) {
    byName.set(tool.name, tool)
  }
  return [...byName.values()]
}

async function runWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`JavaScript REPL execution timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    promise.then(
      value => {
        clearTimeout(timeout)
        resolve(value)
      },
      error => {
        clearTimeout(timeout)
        reject(error)
      },
    )
  })
}

function formatToolCallSummary(call: ReplToolCallSummary): string {
  const input = preview(stringifyUnknown(call.toolInput))
  if (!call.success) {
    return `${call.toolName}(${input}) -> ERROR: ${call.error ?? 'unknown error'}`
  }
  return `${call.toolName}(${input}) -> ${preview(stringifyUnknown(call.result))}`
}

function formatModelToolResult(output: Output): string {
  const lines: string[] = []
  lines.push(
    output.error
      ? 'JavaScript REPL execution failed.'
      : 'JavaScript REPL execution completed.',
  )

  if (output.toolCalls.length > 0) {
    lines.push(`Inner tool calls (${output.toolCalls.length}):`)
    for (const call of output.toolCalls) {
      lines.push(`- ${formatToolCallSummary(call)}`)
    }
  } else {
    lines.push('Inner tool calls: none')
  }

  if (output.stdout.trim().length > 0) {
    lines.push(`stdout:\n${preview(output.stdout)}`)
  }
  if (output.stderr.trim().length > 0) {
    lines.push(`stderr:\n${preview(output.stderr)}`)
  }
  if (output.error) {
    lines.push(`error:\n${output.error}`)
  } else if ('result' in output) {
    lines.push(`result:\n${preview(stringifyUnknown(output.result))}`)
  }

  return lines.join('\n\n')
}

function renderProgressHint(data: ReplToolCallProgress): string {
  if (data.phase !== 'start') {
    return 'Running JavaScript REPL script...'
  }
  const input = data.toolInput
  const hintRaw =
    typeof input.command === 'string'
      ? input.command
      : typeof input.file_path === 'string'
        ? input.file_path
        : typeof input.path === 'string'
          ? input.path
          : typeof input.pattern === 'string'
            ? input.pattern
            : undefined
  if (!hintRaw) {
    return `Running ${data.toolName}...`
  }
  return `Running ${data.toolName}: ${preview(hintRaw, 200)}`
}

export function createJavascriptReplTool(
  config: JavascriptReplToolConfig,
) {
  const inputSchema = buildInputSchema(config.inputSchemaDescription)
  const outputSchema = buildOutputSchema()
  const hiddenToolNames = new Set(config.forbiddenNestedToolNames ?? [])

  return buildTool({
    name: config.toolName,
    searchHint: config.searchHint,
    maxResultSizeChars: Infinity,
    async description() {
      return config.description
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
    toAutoClassifierInput(input) {
      return input.code
    },
    async checkPermissions(input, context): Promise<PermissionResult> {
      const mode = context.getAppState().toolPermissionContext.mode
      if (mode === 'acceptEdits') {
        return {
          behavior: 'allow',
          updatedInput: input,
          decisionReason: {
            type: 'mode',
            mode,
          },
        }
      }
      return {
        behavior: 'passthrough',
        updatedInput: input,
      }
    },
    async prompt() {
      return typeof config.prompt === 'function' ? config.prompt() : config.prompt
    },
    userFacingName() {
      return config.userFacingName
    },
    isTransparentWrapper() {
      return config.isTransparentWrapper
    },
    renderToolUseMessage(input) {
      const compact = input.code.replace(/\s+/g, ' ').trim()
      if (!compact) {
        return 'script'
      }
      return preview(compact, 120)
    },
    renderToolUseProgressMessage(progressMessages) {
      const latest = [...progressMessages]
        .reverse()
        .find(
          (
            message,
          ): message is ProgressMessage<ReplToolCallProgress> =>
            message.data.type === 'repl_tool_call',
        )
      return (
        <MessageResponse height={1}>
          <Text dimColor>
            {latest
              ? renderProgressHint(latest.data)
              : 'Running JavaScript REPL script...'}
          </Text>
        </MessageResponse>
      )
    },
    renderToolResultMessage() {
      if (config.isTransparentWrapper) {
        return null
      }
      return undefined
    },
    renderToolUseErrorMessage(content) {
      return (
        <MessageResponse height={1}>
          <Text>{typeof content === 'string' ? content : stringifyUnknown(content)}</Text>
        </MessageResponse>
      )
    },
    mapToolResultToToolResultBlockParam(
      content: Output,
      toolUseID: string,
    ): ToolResultBlockParam {
      return {
        type: 'tool_result',
        tool_use_id: toolUseID,
        content: formatModelToolResult(content),
        ...(content.error ? { is_error: true } : {}),
      }
    },
    async call(
      input,
      toolUseContext,
      canUseTool: CanUseToolFn,
      parentMessage: AssistantMessage,
      onProgress?: ToolCallProgress<ReplToolCallProgress>,
    ) {
      const replContext = getOrCreateJavascriptReplContext(
        toolUseContext,
        config.toolName,
      )
      replContext.console.clear()
      ensureRuntimeHelpers(replContext)

      const virtualMessages: Message[] = []
      const contextModifiers: Array<
        (context: ToolUseContext) => ToolUseContext
      > = []
      const toolCalls: ReplToolCallSummary[] = []
      const availableTools = augmentToolsForJavascriptRepl(toolUseContext)
      const outerToolUseID = toolUseContext.toolUseId ?? randomUUID()

      const globals = replContext.vmContext as Record<string, unknown>

      replContext.registeredTools.clear()
      for (const tool of availableTools) {
        if (hiddenToolNames.has(tool.name)) {
          continue
        }
        const wrapper = createToolWrapper(tool.name, {
          toolUseContext,
          availableTools,
          canUseTool,
          outerToolUseID,
          onProgress,
          pushMessage: message => {
            virtualMessages.push(message)
          },
          pushContextModifier: modifyContext => {
            contextModifiers.push(modifyContext)
          },
          pushCallSummary: summary => {
            toolCalls.push(summary)
          },
        })

        const schemaCandidate =
          tool.inputJSONSchema ??
          ((tool.inputSchema as { toJSON?: () => unknown }).toJSON?.() ?? {})

        replContext.registeredTools.set(tool.name, {
          name: tool.name,
          description: tool.userFacingName(undefined),
          schema: ensureRecord(schemaCandidate),
          handler: args => wrapper(ensureRecord(args)),
        })
      }

      for (const primitive of config.directGlobalTools ?? getReplPrimitiveTools()) {
        if (hiddenToolNames.has(primitive.name) || !isSafeIdentifier(primitive.name)) {
          continue
        }
        globals[primitive.name] = async (args?: Record<string, unknown>) => {
          const registered = replContext.registeredTools.get(primitive.name)
          if (!registered) {
            throw new Error(`Unknown JavaScript REPL tool: ${primitive.name}`)
          }
          return registered.handler(ensureRecord(args))
        }
      }

      const toolNamespace: Record<string, unknown> = {}
      for (const [name, registeredTool] of replContext.registeredTools.entries()) {
        toolNamespace[name] = async (args?: Record<string, unknown>) =>
          registeredTool.handler(ensureRecord(args))
      }
      globals.tools = toolNamespace

      let executionResult: unknown = undefined
      let executionError: string | undefined
      try {
        const wrappedCode = `(async () => {\n${input.code}\n})()`
        const script = new Script(wrappedCode, {
          filename: `${config.toolName}.vm.js`,
        })
        executionResult = await runWithTimeout(
          Promise.resolve(
            script.runInContext(replContext.vmContext, {
              timeout: input.timeout_ms,
            }),
          ),
          input.timeout_ms,
        )
      } catch (error) {
        executionError = error instanceof Error ? error.message : String(error)
        replContext.console.error(executionError)
      }

      const output: Output = {
        ...(executionResult !== undefined ? { result: executionResult } : {}),
        stdout: replContext.console.getStdout(),
        stderr: replContext.console.getStderr(),
        ...(executionError ? { error: executionError } : {}),
        toolCalls,
      }

      return {
        data: output,
        ...(config.emitVirtualMessages && virtualMessages.length > 0
          ? { newMessages: virtualMessages }
          : {}),
        ...(contextModifiers.length > 0
          ? {
              contextModifier: (context: ToolUseContext) =>
                contextModifiers.reduce(
                  (ctx, modifier) => modifier(ctx),
                  context,
                ),
            }
          : {}),
      }
    },
  } satisfies ToolDef<
    ReturnType<typeof inputSchema>,
    Output,
    ReplToolCallProgress
  >)
}
