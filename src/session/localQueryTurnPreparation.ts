import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'
import type { ToolPermissionContext } from '../Tool.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import type { QueryParams } from '../query.js'
import type { QuerySource } from '../constants/querySource.js'
import type { Message } from '../types/message.js'
import type { ProcessUserInputContext } from '../utils/processUserInput/processUserInput.js'
import type { MCPServerConnection } from '../services/mcp/types.js'
import type { SystemPrompt } from '../utils/systemPrompt.js'
import type { EffortValue } from '../utils/effort.js'
import { logForDebugging } from '../utils/debug.js'

export type LocalQueryExtraUserContextFactory = (context: {
  mcpClients: MCPServerConnection[]
}) => Record<string, string>

export type PrepareLocalQueryEngineTurnOptions = {
  messages: Message[]
  newMessages: Message[]
  abortController: AbortController
  mainLoopModel: string
  toolPermissionContext: Pick<
    ToolPermissionContext,
    'additionalWorkingDirectories'
  >
  mainThreadAgentDefinition: AgentDefinition | undefined
  customSystemPrompt?: string
  appendSystemPrompt?: string
  canUseTool: CanUseToolFn
  querySource: QuerySource
  effort?: EffortValue
  getExtraUserContext?: LocalQueryExtraUserContextFactory
}

type GetSystemPromptFn = (
  tools: ProcessUserInputContext['options']['tools'],
  model: string,
  additionalWorkingDirectories?: string[],
  mcpClients?: MCPServerConnection[],
) => Promise<string[]>

type BuildEffectiveSystemPromptFn = (args: {
  mainThreadAgentDefinition: AgentDefinition | undefined
  toolUseContext: Pick<ProcessUserInputContext, 'options'>
  customSystemPrompt: string | undefined
  defaultSystemPrompt: string[]
  appendSystemPrompt: string | undefined
  overrideSystemPrompt?: string | null
}) => SystemPrompt

export type PrepareLocalQueryEngineTurnDeps = {
  getToolUseContext: (
    messages: Message[],
    newMessages: Message[],
    abortController: AbortController,
    mainLoopModel: string,
  ) => ProcessUserInputContext
  getSystemPrompt: GetSystemPromptFn
  getUserContext: () => Promise<Record<string, string>>
  getSystemContext: () => Promise<Record<string, string>>
  buildEffectiveSystemPrompt: BuildEffectiveSystemPromptFn
}

export type PreparedLocalQueryEngineTurn = {
  params: QueryParams
  toolUseContext: ProcessUserInputContext
}

export async function prepareLocalQueryEngineTurn(
  options: PrepareLocalQueryEngineTurnOptions,
  deps: PrepareLocalQueryEngineTurnDeps,
): Promise<PreparedLocalQueryEngineTurn> {
  logForDebugging('[ncode-debug] prepareLocalQueryEngineTurn start')
  const toolUseContext = deps.getToolUseContext(
    options.messages,
    options.newMessages,
    options.abortController,
    options.mainLoopModel,
  )

  const {
    tools: freshTools,
    mcpClients: freshMcpClients,
  } = toolUseContext.options

  if (options.effort !== undefined) {
    const previousGetAppState = toolUseContext.getAppState
    toolUseContext.getAppState = () => ({
      ...previousGetAppState(),
      effortValue: options.effort,
    })
  }

  logForDebugging(`[ncode-debug] prepareLocalQueryEngineTurn tool ctx tools=${freshTools.length} mcpClients=${freshMcpClients.length}`)
  const systemPromptPromise = deps.getSystemPrompt(
        freshTools,
        options.mainLoopModel,
        Array.from(
          options.toolPermissionContext.additionalWorkingDirectories.keys(),
        ),
        freshMcpClients,
      ).then(value => { logForDebugging(`[ncode-debug] prepareLocalQueryEngineTurn getSystemPrompt done sections=${value.length}`); return value })
  const userContextPromise = deps.getUserContext().then(value => { logForDebugging(`[ncode-debug] prepareLocalQueryEngineTurn getUserContext done keys=${Object.keys(value).length}`); return value })
  const systemContextPromise = deps.getSystemContext().then(value => { logForDebugging(`[ncode-debug] prepareLocalQueryEngineTurn getSystemContext done keys=${Object.keys(value).length}`); return value })
  const [defaultSystemPrompt, baseUserContext, systemContext] =
    await Promise.all([
      systemPromptPromise,
      userContextPromise,
      systemContextPromise,
    ])

  const userContext = {
    ...baseUserContext,
    ...(options.getExtraUserContext?.({ mcpClients: freshMcpClients }) ?? {}),
  }

  logForDebugging('[ncode-debug] prepareLocalQueryEngineTurn contexts ready')
  const systemPrompt = deps.buildEffectiveSystemPrompt({
    mainThreadAgentDefinition: options.mainThreadAgentDefinition,
    toolUseContext,
    customSystemPrompt: options.customSystemPrompt,
    defaultSystemPrompt,
    appendSystemPrompt: options.appendSystemPrompt,
  })

  toolUseContext.renderedSystemPrompt = systemPrompt
  logForDebugging('[ncode-debug] prepareLocalQueryEngineTurn system prompt built')

  return {
    params: {
      messages: options.messages,
      systemPrompt,
      userContext,
      systemContext,
      canUseTool: options.canUseTool,
      toolUseContext,
      querySource: options.querySource,
    },
    toolUseContext,
  }
}
