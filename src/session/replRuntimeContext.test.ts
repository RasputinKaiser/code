import { describe, expect, it, mock } from 'bun:test'
import type { MutableRefObject } from 'react'
import type { Theme } from '../utils/theme.js'
import type { Message as MessageType } from '../types/message.js'
import { createToolUseContextGetter, type ToolAssemblyProviders, type ToolUseContextDeps } from './replRuntimeContext.js'

type MinimalState = {
  verbose: boolean
  thinkingEnabled?: boolean
  mcp: {
    tools: unknown[]
    clients: unknown[]
    resources: unknown[]
  }
  toolPermissionContext: {
    mode: string
  }
  agentDefinitions: Record<string, unknown>
  fileHistory: { marker: string }
  attribution: { owner: string }
}

function createDeps(
  overrides: Partial<ToolUseContextDeps> = {},
): ToolUseContextDeps {
  const state: MinimalState = {
    verbose: true,
    thinkingEnabled: true,
    mcp: {
      tools: [],
      clients: [],
      resources: [],
    },
    toolPermissionContext: {
      mode: 'default',
    },
    agentDefinitions: {
      current: 'leader',
    },
    fileHistory: { marker: 'file-history' },
    attribution: { owner: 'leader' },
  }

  const setAppState = mock((updater: (prev: MinimalState) => MinimalState) => {
    updater(state)
  }) as unknown as ToolUseContextDeps['setAppState']

  return {
    commands: [],
    combinedInitialTools: [],
    mainThreadAgentDefinition: undefined,
    thinkingConfig: { type: 'enabled' } as ToolUseContextDeps['thinkingConfig'],
    debug: false,
    initialMcpClients: [],
    ideInstallationStatus: null,
    dynamicMcpConfig: undefined,
    theme: {} as Theme,
    allowedAgentTypes: undefined,
    store: {
      getState: () => state,
    } as ToolUseContextDeps['store'],
    setAppState,
    reverify: mock(),
    addNotification: mock(),
    setMessages: mock(),
    setRemoteSessionConfig: mock(),
    setToolJSX: mock(),
    setIDEToInstallExtension: mock(),
    onChangeDynamicMcpConfig: mock(),
    terminal: {
      progress: mock(),
    } as ToolUseContextDeps['terminal'],
    setResponseLength: mock(),
    responseLengthRef: { current: 0 },
    apiMetricsRef: { current: [] },
    setStreamMode: mock(),
    setStreamingToolUses: mock(),
    setStreamingThinking: mock(),
    onStreamingText: mock(),
    setInProgressToolUseIDs: mock(),
    setHasInterruptibleToolInProgress: mock(),
    resume: mock(async () => {}),
    setConversationId: mock(),
    setSpinnerMessage: mock(),
    setSpinnerColor: mock(),
    setSpinnerShimmerColor: mock(),
    setIsMessageSelectorVisible: mock(),
    disabled: false,
    readFileState: { current: new Map() } as MutableRefObject<never>,
    contentReplacementStateRef: { current: undefined },
    loadedNestedMemoryPathsRef: { current: new Set() },
    discoveredSkillNamesRef: { current: new Set() },
    ...overrides,
  }
}

function createStubProviders(
  overrides: Partial<ToolAssemblyProviders> = {},
): ToolAssemblyProviders {
  return {
    assembleToolPool: mock(() => []) as never,
    filterToolsByDenyRules: mock((tools: unknown[]) => tools) as never,
    mergeAndFilterTools: mock((_initial: unknown[], _assembled: unknown[], _mode: string) => []) as never,
    resolveAgentTools: mock((_agent: unknown, tools: unknown[]) => ({
      resolvedTools: tools,
    })) as never,
    mergeClients: mock((initial: unknown[], dynamic: unknown[]) => [...initial, ...dynamic]) as never,
    ...overrides,
  }
}

describe('createToolUseContextGetter', () => {
  it('preserves the readFileState ref contract from REPL', () => {
    const readFileState = { current: new Map([['CLAUDE.md', 'cached']]) } as MutableRefObject<never>
    const deps = createDeps({ readFileState })
    const getContext = createToolUseContextGetter(deps, createStubProviders())

    const context = getContext([], [], new AbortController(), 'gpt-test')

    expect(context.readFileState).toBe(readFileState.current)
  })

  it('only opens the message selector when the REPL is not disabled', () => {
    const setIsMessageSelectorVisible = mock()
    const getEnabledContext = createToolUseContextGetter(
      createDeps({
        disabled: false,
        setIsMessageSelectorVisible,
      }),
      createStubProviders(),
    )
    getEnabledContext([], [], new AbortController(), 'gpt-test').openMessageSelector()
    expect(setIsMessageSelectorVisible).toHaveBeenCalledWith(true)

    setIsMessageSelectorVisible.mockClear()

    const getDisabledContext = createToolUseContextGetter(
      createDeps({
        disabled: true,
        setIsMessageSelectorVisible,
      }),
      createStubProviders(),
    )
    getDisabledContext([], [], new AbortController(), 'gpt-test').openMessageSelector()
    expect(setIsMessageSelectorVisible).not.toHaveBeenCalled()
  })

  it('preserves tool assembly and thinking gating semantics from app state', () => {
    const assembleToolPool = mock(() => [{ name: 'assembled' }])
    const filterToolsByDenyRules = mock((tools: unknown[], context: unknown) => {
      expect(tools).toEqual([{ name: 'initial' }])
      expect(context).toEqual({ mode: 'plan' })
      return [{ name: 'initial' }]
    })
    const mergeAndFilterTools = mock((initial: unknown[], assembled: unknown[], mode: string) => {
      expect(initial).toEqual([{ name: 'initial' }])
      expect(assembled).toEqual([{ name: 'assembled' }])
      expect(mode).toBe('plan')
      return [{ name: 'merged' }]
    })
    const resolveAgentTools = mock(() => ({
      resolvedTools: [{ name: 'resolved' }],
    }))
    const mergeClients = mock((initial: unknown[], dynamic: unknown[]) => [...initial, ...dynamic])

    const deps = createDeps({
      combinedInitialTools: [{ name: 'initial' }] as never,
      mainThreadAgentDefinition: { prompt: 'agent' } as never,
      allowedAgentTypes: ['worker'],
      initialMcpClients: [{ id: 'initial-client' }] as never,
      store: {
        getState: () =>
          ({
            verbose: false,
            thinkingEnabled: false,
            mcp: {
              tools: [{ name: 'dynamic-tool' }],
              clients: [{ id: 'dynamic-client' }],
              resources: [{ id: 'resource' }],
            },
            toolPermissionContext: {
              mode: 'plan',
            },
            agentDefinitions: {
              current: 'leader',
            },
            fileHistory: { marker: 'file-history' },
            attribution: { owner: 'leader' },
          }) satisfies MinimalState,
      } as ToolUseContextDeps['store'],
    })

    const providers: ToolAssemblyProviders = {
      assembleToolPool: assembleToolPool as never,
      filterToolsByDenyRules: filterToolsByDenyRules as never,
      mergeAndFilterTools: mergeAndFilterTools as never,
      resolveAgentTools: resolveAgentTools as never,
      mergeClients: mergeClients as never,
    }

    const getContext = createToolUseContextGetter(deps, providers)
    const context = getContext(
      [{ uuid: 'm1' } as MessageType],
      [{ uuid: 'm2' } as MessageType],
      new AbortController(),
      'gpt-test',
    )

    expect(context.options.tools).toEqual([{ name: 'resolved' }])
    expect(context.options.refreshTools()).toEqual([{ name: 'resolved' }])
    expect(context.options.thinkingConfig).toEqual({ type: 'disabled' })
    expect(context.options.mcpClients).toEqual([
      { id: 'initial-client' },
      { id: 'dynamic-client' },
    ])
    expect(context.options.mcpResources).toEqual([{ id: 'resource' }])
    expect(context.options.agentDefinitions).toEqual({
      current: 'leader',
      allowedAgentTypes: ['worker'],
    })
    expect(assembleToolPool).toHaveBeenCalledTimes(2)
    expect(filterToolsByDenyRules).toHaveBeenCalledTimes(2)
    expect(mergeAndFilterTools).toHaveBeenCalledTimes(2)
    expect(resolveAgentTools).toHaveBeenCalledTimes(2)
  })
})
