import type { ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import { randomUUID } from 'crypto'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import {
  type Tool,
  type ToolCallProgress,
  type ToolPermissionContext,
  type ToolUseContext,
} from '../../Tool.js'
import { runToolUse } from '../../services/tools/toolExecution.js'
import type {
  AssistantMessage,
  Message,
  UserMessage,
} from '../../types/message.js'
import { createAssistantMessage } from '../../utils/messages.js'
import { getAllowRules } from '../../utils/permissions/permissions.js'
import { permissionRuleValueFromString } from '../../utils/permissions/permissionRuleParser.js'

export type ReplToolCallProgress = {
  type: 'repl_tool_call'
  phase: 'start' | 'end'
  toolName: string
  toolInput: Record<string, unknown>
  success?: boolean
  error?: string
}

export type ReplToolCallSummary = {
  toolName: string
  toolInput: Record<string, unknown>
  success: boolean
  result?: unknown
  error?: string
}

export type ReplWrapperRuntime = {
  toolUseContext: ToolUseContext
  availableTools: readonly Tool[]
  canUseTool: CanUseToolFn
  outerToolUseID: string
  onProgress?: ToolCallProgress<ReplToolCallProgress>
  pushMessage: (message: Message) => void
  pushContextModifier: (modify: (context: ToolUseContext) => ToolUseContext) => void
  pushCallSummary: (summary: ReplToolCallSummary) => void
}

function makeVirtualMessage(message: Message): Message {
  if (message.type === 'assistant' || message.type === 'user') {
    return {
      ...message,
      isVirtual: true,
    }
  }
  return message
}

function extractToolResultBlock(
  message: UserMessage,
): { isError: boolean; text: string | undefined } | null {
  if (!Array.isArray(message.message.content)) {
    return null
  }
  const block = message.message.content.find(
    c => c.type === 'tool_result',
  )
  if (!block) {
    return null
  }
  if (typeof block.content === 'string') {
    return { isError: Boolean(block.is_error), text: block.content }
  }
  const text = block.content
    .map(c => {
      if (c.type === 'text') {
        return c.text
      }
      return `[${c.type}]`
    })
    .join('\n')
  return { isError: Boolean(block.is_error), text }
}

function ensureRecord(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>
  }
  return {}
}

export function stripCliDenyRulesShadowingNestedAllows(
  toolPermissionContext: ToolPermissionContext,
  availableTools: readonly Tool[],
): ToolPermissionContext {
  const cliDenyRules = toolPermissionContext.alwaysDenyRules.cliArg
  if (!cliDenyRules || cliDenyRules.length === 0) {
    return toolPermissionContext
  }

  const availableToolNames = new Set(availableTools.map(tool => tool.name))
  const nestedAllowedToolNames = new Set(
    getAllowRules(toolPermissionContext)
      .map(rule => rule.ruleValue.toolName)
      .filter(toolName => availableToolNames.has(toolName)),
  )
  if (nestedAllowedToolNames.size === 0) {
    return toolPermissionContext
  }

  const filteredCliDenyRules = cliDenyRules.filter(ruleString => {
    const ruleValue = permissionRuleValueFromString(ruleString)
    return !(
      ruleValue.ruleContent === undefined &&
      nestedAllowedToolNames.has(ruleValue.toolName)
    )
  })

  if (filteredCliDenyRules.length === cliDenyRules.length) {
    return toolPermissionContext
  }

  return {
    ...toolPermissionContext,
    alwaysDenyRules: {
      ...toolPermissionContext.alwaysDenyRules,
      cliArg: filteredCliDenyRules,
    },
  }
}

export function createNestedGetAppState(
  baseGetAppState: ToolUseContext['getAppState'],
  availableTools: readonly Tool[],
): ToolUseContext['getAppState'] {
  return () => {
    const appState = baseGetAppState()
    const updatedToolPermissionContext = stripCliDenyRulesShadowingNestedAllows(
      appState.toolPermissionContext,
      availableTools,
    )
    if (updatedToolPermissionContext === appState.toolPermissionContext) {
      return appState
    }
    return {
      ...appState,
      toolPermissionContext: updatedToolPermissionContext,
    }
  }
}

export function createToolWrapper(
  toolName: string,
  runtime: ReplWrapperRuntime,
): (args: Record<string, unknown>) => Promise<unknown> {
  return async (rawArgs: Record<string, unknown>) => {
    const toolInput = ensureRecord(rawArgs)
    const innerToolUseID = randomUUID()

    const toolUse: ToolUseBlock = {
      type: 'tool_use',
      id: innerToolUseID,
      name: toolName,
      input: toolInput,
    }

    const assistantMessage = createAssistantMessage({
      content: [toolUse],
      isVirtual: true,
    }) as AssistantMessage

    runtime.pushMessage(assistantMessage)
    runtime.onProgress?.({
      toolUseID: runtime.outerToolUseID,
      data: {
        type: 'repl_tool_call',
        phase: 'start',
        toolName,
        toolInput,
      },
    })

    const innerContext: ToolUseContext = {
      ...runtime.toolUseContext,
      getAppState: createNestedGetAppState(
        runtime.toolUseContext.getAppState,
        runtime.availableTools,
      ),
      options: {
        ...runtime.toolUseContext.options,
        tools: runtime.availableTools,
      },
    }

    let sawToolResult = false
    let toolResult: unknown
    let toolError: string | undefined

    for await (const update of runToolUse(
      toolUse,
      assistantMessage,
      runtime.canUseTool,
      innerContext,
    )) {
      if (update.contextModifier) {
        runtime.pushContextModifier(update.contextModifier.modifyContext)
      }
      if (update.message.type === 'progress') {
        continue
      }
      runtime.pushMessage(makeVirtualMessage(update.message))
      if (update.message.type === 'user') {
        const toolResultBlock = extractToolResultBlock(update.message)
        if (toolResultBlock) {
          sawToolResult = true
          toolResult = update.message.toolUseResult
          if (toolResultBlock.isError) {
            toolError =
              toolResultBlock.text ||
              (typeof update.message.toolUseResult === 'string'
                ? update.message.toolUseResult
                : `Tool ${toolName} failed`)
          }
        }
      }
    }

    const success = sawToolResult && !toolError
    runtime.pushCallSummary({
      toolName,
      toolInput,
      success,
      ...(success ? { result: toolResult } : { error: toolError }),
    })
    runtime.onProgress?.({
      toolUseID: runtime.outerToolUseID,
      data: {
        type: 'repl_tool_call',
        phase: 'end',
        toolName,
        toolInput,
        success,
        ...(toolError ? { error: toolError } : {}),
      },
    })

    if (!sawToolResult) {
      throw new Error(`Tool ${toolName} did not return a tool_result block`)
    }
    if (toolError) {
      throw new Error(toolError)
    }
    return toolResult
  }
}
