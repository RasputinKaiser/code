import { randomUUID } from 'crypto'
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface, type Interface } from 'node:readline'
import { tmpdir } from 'os'
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
  type ReplWrapperRuntime,
} from './toolWrappers.js'
import { resolvePythonReplHostExecutable } from './pyReplHost.js'
import kernelAssetPath from './kernel.py'

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_TIMEOUT_MS = 120_000
const PREVIEW_LIMIT = 20_000
const PYTHON_MIN_VERSION = [3, 10, 0] as const

type PendingExec = {
  resolve: (value: PythonKernelExecResultMessage) => void
  reject: (error: Error) => void
  runtime: ReplWrapperRuntime
}

type PythonKernelExecResultMessage = {
  type: 'exec_result'
  id: string
  ok: boolean
  output: string
  error: string | null
}

type PythonKernelRunToolMessage = {
  type: 'run_tool'
  id: string
  exec_id: string
  tool_name: string
  arguments: string
}

type PythonKernelMessage =
  | PythonKernelExecResultMessage
  | PythonKernelRunToolMessage

type InputSchemaDescription = {
  codeDescription: string
}

type PythonReplToolConfig = {
  toolName: string
  searchHint: string
  description: string
  prompt: string | (() => string)
  userFacingName: string
  inputSchemaDescription: InputSchemaDescription
  forbiddenNestedToolNames?: readonly string[]
}

export type PythonReplStoreContext = {
  manager: PythonReplManager
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
      output: z.string(),
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

type PythonReplToolOutput = z.infer<ReturnType<typeof buildOutputSchema>>

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

function parsePragmaTimeout(code: string): number | undefined {
  const firstLine = code.split('\n', 1)[0]?.trimStart() ?? ''
  if (!firstLine.startsWith('# codex-py-repl:')) {
    return undefined
  }
  const pragma = firstLine.slice('# codex-py-repl:'.length).trim()
  for (const token of pragma.split(/\s+/)) {
    const [key, value] = token.split('=')
    if (key !== 'timeout_ms' || !value) continue
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= MAX_TIMEOUT_MS) {
      return parsed
    }
  }
  return undefined
}

function compareVersion(left: readonly number[], right: readonly number[]): number {
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0
    const rightValue = right[index] ?? 0
    if (leftValue !== rightValue) {
      return leftValue - rightValue
    }
  }
  return 0
}

function parsePythonVersion(stdout: string): number[] | null {
  const match = stdout.trim().match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return match.slice(1).map(part => Number.parseInt(part, 10))
}

function resolvePythonExecutable(): string {
  const explicitCandidates = [
    process.env.NCODE_PY_REPL_PYTHON_PATH,
    process.env.CLAUDE_CODE_PY_REPL_PYTHON_PATH,
  ].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim() !== '')

  const candidates = explicitCandidates.length > 0
    ? explicitCandidates
    : ['python3', 'python']

  for (const candidate of candidates) {
    const result = spawnSync(
      candidate,
      [
        '-c',
        'import sys; print(".".join(str(part) for part in sys.version_info[:3]))',
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    if (result.status !== 0) {
      continue
    }

    const version = parsePythonVersion(result.stdout)
    if (!version) {
      continue
    }

    if (compareVersion(version, PYTHON_MIN_VERSION) >= 0) {
      return candidate
    }
  }

  const requested = explicitCandidates.length > 0
    ? explicitCandidates.join(', ')
    : 'python3, python'
  throw new Error(
    `py_repl requires Python ${PYTHON_MIN_VERSION.join('.')}+; none of the configured runtimes are usable (${requested})`,
  )
}

function augmentToolsForPythonRepl(toolUseContext: ToolUseContext): Tool[] {
  const byName = new Map<string, Tool>()
  for (const tool of toolUseContext.options.tools) {
    byName.set(tool.name, tool)
  }
  for (const tool of getReplPrimitiveTools()) {
    byName.set(tool.name, tool)
  }
  return [...byName.values()]
}

function formatToolCallSummary(call: ReplToolCallSummary): string {
  const input = preview(stringifyUnknown(call.toolInput))
  if (!call.success) {
    return `${call.toolName}(${input}) -> ERROR: ${call.error ?? 'unknown error'}`
  }
  return `${call.toolName}(${input}) -> ${preview(stringifyUnknown(call.result))}`
}

function formatModelToolResult(output: PythonReplToolOutput): string {
  const lines: string[] = []
  lines.push(output.error ? 'Python REPL execution failed.' : 'Python REPL execution completed.')

  if (output.toolCalls.length > 0) {
    lines.push(`Inner tool calls (${output.toolCalls.length}):`)
    for (const call of output.toolCalls) {
      lines.push(`- ${formatToolCallSummary(call)}`)
    }
  } else {
    lines.push('Inner tool calls: none')
  }

  if (output.output.trim().length > 0) {
    lines.push(`output:\n${preview(output.output)}`)
  }
  if (output.error) {
    lines.push(`error:\n${output.error}`)
  }

  return lines.join('\n\n')
}

function renderProgressHint(data: ReplToolCallProgress): string {
  if (data.phase !== 'start') {
    return 'Running Python REPL script...'
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

export class PythonReplManager {
  private child: ChildProcessWithoutNullStreams | null = null
  private stdoutReader: Interface | null = null
  private pendingExecs = new Map<string, PendingExec>()
  private stderrTail: string[] = []
  private serialQueue: Promise<unknown> = Promise.resolve()
  private startupPromise: Promise<void> | null = null

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.serialQueue.catch(() => undefined).then(operation)
    this.serialQueue = run.catch(() => undefined)
    return run
  }

  async execute(
    input: { code: string; timeoutMs: number },
    runtime: ReplWrapperRuntime,
  ): Promise<{ output: string; error?: string }> {
    return this.runExclusive(async () => {
      await this.ensureStarted()
      const child = this.child
      if (!child?.stdin.writable) {
        throw new Error('Python REPL kernel stdin is not writable')
      }

      const execId = randomUUID()
      const pending = await new Promise<PythonKernelExecResultMessage>((resolve, reject) => {
        this.pendingExecs.set(execId, { resolve, reject, runtime })
        child.stdin.write(
          `${JSON.stringify({
            type: 'exec',
            id: execId,
            code: input.code,
            timeout_ms: input.timeoutMs,
          })}\n`,
        )
      }).finally(() => {
        this.pendingExecs.delete(execId)
      })

      if (!pending.ok) {
        return {
          output: pending.output,
          error: pending.error ?? 'Python REPL execution failed',
        }
      }

      return {
        output: pending.output,
      }
    })
  }

  async reset(): Promise<void> {
    await this.runExclusive(async () => {
      this.shutdown('py_repl reset')
    })
  }

  private async ensureStarted(): Promise<void> {
    if (this.child && this.child.exitCode === null && !this.child.killed) {
      return
    }
    if (this.startupPromise) {
      await this.startupPromise
      return
    }
    this.startupPromise = this.start()
    try {
      await this.startupPromise
    } finally {
      this.startupPromise = null
    }
  }

  private async start(): Promise<void> {
    const rustHostPath = await resolvePythonReplHostExecutable()
    const child = rustHostPath
      ? spawn(rustHostPath, [], {
          cwd: process.cwd(),
          env: {
            ...process.env,
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      : spawn(resolvePythonExecutable(), [kernelAssetPath], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            NCODE_PY_TMP_DIR: tmpdir(),
            NCODE_PY_REPL_PYTHON_MODULE_DIRS: '',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        })

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    const stdoutReader = createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    })
    stdoutReader.on('line', line => {
      void this.handleKernelStdoutLine(line)
    })

    child.stderr.on('data', chunk => {
      const text = String(chunk)
      for (const line of text.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        this.stderrTail.push(trimmed)
        if (this.stderrTail.length > 20) {
          this.stderrTail.shift()
        }
      }
    })

    const handleExit = (reason: string) => {
      this.shutdown(reason)
    }
    child.on('error', error => {
      handleExit(error.message)
    })
    child.on('exit', (code, signal) => {
      handleExit(
        `Python REPL kernel exited${code !== null ? ` with code ${code}` : ''}${signal ? ` (${signal})` : ''}`,
      )
    })

    this.child = child
    this.stdoutReader = stdoutReader
  }

  private async handleKernelStdoutLine(line: string): Promise<void> {
    const trimmed = line.trim()
    if (!trimmed) return

    let message: PythonKernelMessage
    try {
      message = JSON.parse(trimmed) as PythonKernelMessage
    } catch {
      return
    }

    if (message.type === 'exec_result') {
      const pending = this.pendingExecs.get(message.id)
      pending?.resolve(message)
      return
    }

    await this.handleKernelRunTool(message)
  }

  private async handleKernelRunTool(message: PythonKernelRunToolMessage): Promise<void> {
    const pending = this.pendingExecs.get(message.exec_id)
    if (!pending) {
      this.writeKernelMessage({
        type: 'run_tool_result',
        id: message.id,
        ok: false,
        error: `Unknown py_repl exec: ${message.exec_id}`,
      })
      return
    }

    let parsedArguments: unknown = {}
    try {
      parsedArguments = message.arguments ? JSON.parse(message.arguments) : {}
    } catch {
      this.writeKernelMessage({
        type: 'run_tool_result',
        id: message.id,
        ok: false,
        error: `py_repl tool arguments for ${message.tool_name} must be valid JSON`,
      })
      return
    }

    const toolInput = ensureRecord(parsedArguments)
    try {
      const wrapper = createToolWrapper(message.tool_name, pending.runtime)
      const response = await wrapper(toolInput)
      this.writeKernelMessage({
        type: 'run_tool_result',
        id: message.id,
        ok: true,
        response,
      })
    } catch (error) {
      this.writeKernelMessage({
        type: 'run_tool_result',
        id: message.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private writeKernelMessage(message: Record<string, unknown>): void {
    const child = this.child
    if (!child?.stdin.writable) {
      throw new Error('Python REPL kernel stdin is not writable')
    }
    child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private shutdown(reason: string): void {
    const error = new Error(
      this.stderrTail.length > 0
        ? `${reason}\n${this.stderrTail.join(' | ')}`
        : reason,
    )

    for (const pending of this.pendingExecs.values()) {
      pending.reject(error)
    }
    this.pendingExecs.clear()

    this.stdoutReader?.close()
    this.stdoutReader = null

    if (this.child && this.child.exitCode === null && !this.child.killed) {
      this.child.kill()
    }
    this.child = null
  }
}

function getOrCreatePythonReplManager(
  toolUseContext: ToolUseContext,
  toolName: string,
): PythonReplManager {
  const existing = toolUseContext.getAppState().pythonReplContexts?.get(toolName)
  if (existing) {
    return existing
  }

  const created = new PythonReplManager()
  toolUseContext.setAppState(prev => {
    const contexts = new Map(prev.pythonReplContexts ?? [])
    contexts.set(toolName, created)
    return {
      ...prev,
      pythonReplContexts: contexts,
    }
  })
  return created
}

export async function clearPythonReplContext(
  toolUseContext: ToolUseContext,
  toolName: string,
): Promise<void> {
  const existing = toolUseContext.getAppState().pythonReplContexts?.get(toolName)
  await existing?.reset()
  toolUseContext.setAppState(prev => {
    if (!prev.pythonReplContexts?.has(toolName)) {
      return prev
    }
    const contexts = new Map(prev.pythonReplContexts)
    contexts.delete(toolName)
    return {
      ...prev,
      pythonReplContexts: contexts,
    }
  })
}

export function createPythonReplTool(config: PythonReplToolConfig) {
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
            {latest ? renderProgressHint(latest.data) : 'Running Python REPL script...'}
          </Text>
        </MessageResponse>
      )
    },
    renderToolUseErrorMessage(content) {
      return (
        <MessageResponse height={1}>
          <Text>{typeof content === 'string' ? content : stringifyUnknown(content)}</Text>
        </MessageResponse>
      )
    },
    mapToolResultToToolResultBlockParam(
      content: PythonReplToolOutput,
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
      _parentMessage: AssistantMessage,
      onProgress?: ToolCallProgress<ReplToolCallProgress>,
    ) {
      const manager = getOrCreatePythonReplManager(toolUseContext, config.toolName)
      const contextModifiers: Array<(context: ToolUseContext) => ToolUseContext> = []
      const toolCalls: ReplToolCallSummary[] = []
      const availableTools = augmentToolsForPythonRepl(toolUseContext)
      const outerToolUseID = toolUseContext.toolUseId ?? randomUUID()

      const result = await manager.execute(
        {
          code: input.code,
          timeoutMs: parsePragmaTimeout(input.code) ?? input.timeout_ms,
        },
        {
          toolUseContext: {
            ...toolUseContext,
            options: {
              ...toolUseContext.options,
              tools: availableTools,
            },
          },
          availableTools: availableTools.filter(tool => !hiddenToolNames.has(tool.name)),
          canUseTool,
          outerToolUseID,
          onProgress,
          pushMessage() {},
          pushContextModifier(modifyContext) {
            contextModifiers.push(modifyContext)
          },
          pushCallSummary(summary) {
            toolCalls.push(summary)
          },
        },
      )

      const output: PythonReplToolOutput = {
        output: result.output,
        ...(result.error ? { error: result.error } : {}),
        toolCalls,
      }

      return {
        data: output,
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
    PythonReplToolOutput,
    ReplToolCallProgress
  >)
}
