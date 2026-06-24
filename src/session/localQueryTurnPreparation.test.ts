import { describe, expect, it } from 'bun:test'
import { prepareLocalQueryEngineTurn } from './localQueryTurnPreparation.js'

describe('prepareLocalQueryEngineTurn', () => {
  it('builds prepared params from the fresh tool context, system prompt, and merged user context', async () => {
    const messages = [{ type: 'assistant', uuid: 'a1' }] as never
    const newMessages = [{ type: 'user', uuid: 'u1' }] as never
    const abortController = new AbortController()
    const tools = [{ name: 'Read' }]
    const mcpClients = [{ id: 'mcp-1' }]
    const toolUseContext = {
      options: {
        tools,
        mcpClients,
      },
      getAppState: () => ({ mode: 'default' }),
      renderedSystemPrompt: undefined,
    } as never
    const systemPrompt = { kind: 'system-prompt' } as never
    const canUseTool = (() => true) as never
    const getSystemPromptCalls: unknown[] = []
    const buildSystemPromptCalls: unknown[] = []

    const result = await prepareLocalQueryEngineTurn(
      {
        messages,
        newMessages,
        abortController,
        mainLoopModel: 'gpt-main',
        toolPermissionContext: {
          additionalWorkingDirectories: new Map([
            ['/repo/a', true],
            ['/repo/b', true],
          ]),
        } as never,
        mainThreadAgentDefinition: { name: 'agent-main' } as never,
        customSystemPrompt: 'custom prompt',
        appendSystemPrompt: 'append prompt',
        canUseTool,
        querySource: 'repl_main_thread' as never,
        getExtraUserContext: ({ mcpClients: clients }) => ({
          mcpCount: String(clients.length),
        }),
      },
      {
        getToolUseContext: (
          receivedMessages,
          receivedNewMessages,
          receivedAbortController,
          receivedModel,
        ) => {
          expect(receivedMessages).toBe(messages)
          expect(receivedNewMessages).toBe(newMessages)
          expect(receivedAbortController).toBe(abortController)
          expect(receivedModel).toBe('gpt-main')
          return toolUseContext
        },
        getSystemPrompt: async (
          freshTools,
          model,
          additionalWorkingDirectories,
          freshMcpClients,
        ) => {
          getSystemPromptCalls.push({
            freshTools,
            model,
            additionalWorkingDirectories,
            freshMcpClients,
          })
          return ['default prompt']
        },
        getUserContext: async () => ({ user: 'base' }),
        getSystemContext: async () => ({ os: 'linux' }),
        buildEffectiveSystemPrompt: args => {
          buildSystemPromptCalls.push(args)
          return systemPrompt
        },
      },
    )

    expect(getSystemPromptCalls).toEqual([
      {
        freshTools: tools,
        model: 'gpt-main',
        additionalWorkingDirectories: ['/repo/a', '/repo/b'],
        freshMcpClients: mcpClients,
      },
    ])
    expect(buildSystemPromptCalls).toEqual([
      {
        mainThreadAgentDefinition: { name: 'agent-main' },
        toolUseContext,
        customSystemPrompt: 'custom prompt',
        defaultSystemPrompt: ['default prompt'],
        appendSystemPrompt: 'append prompt',
      },
    ])
    expect(toolUseContext.renderedSystemPrompt).toBe(systemPrompt)
    expect(result).toEqual({
      params: {
        messages,
        systemPrompt,
        userContext: {
          user: 'base',
          mcpCount: '1',
        },
        systemContext: {
          os: 'linux',
        },
        canUseTool,
        toolUseContext,
        querySource: 'repl_main_thread',
      },
      toolUseContext,
    })
  })

  it('overrides effort through getAppState without losing existing app state fields', async () => {
    const toolUseContext = {
      options: {
        tools: [],
        mcpClients: [],
      },
      getAppState: () => ({
        mode: 'default',
        existingField: 'keep-me',
      }),
      renderedSystemPrompt: undefined,
    } as never

    await prepareLocalQueryEngineTurn(
      {
        messages: [] as never,
        newMessages: [] as never,
        abortController: new AbortController(),
        mainLoopModel: 'gpt-main',
        toolPermissionContext: {
          additionalWorkingDirectories: new Map(),
        } as never,
        mainThreadAgentDefinition: undefined,
        canUseTool: (() => true) as never,
        querySource: 'repl_main_thread' as never,
        effort: 'high' as never,
      },
      {
        getToolUseContext: () => toolUseContext,
        getSystemPrompt: async () => [],
        getUserContext: async () => ({}),
        getSystemContext: async () => ({}),
        buildEffectiveSystemPrompt: () => ({ kind: 'system-prompt' } as never),
      },
    )

    expect(toolUseContext.getAppState()).toEqual({
      mode: 'default',
      existingField: 'keep-me',
      effortValue: 'high',
    })
  })
})
