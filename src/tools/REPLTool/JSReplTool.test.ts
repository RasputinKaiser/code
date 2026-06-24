import { describe, expect, it } from 'bun:test'
import { getDefaultAppState } from '../../state/AppStateStore.js'
import { JSReplResetTool } from './JSReplResetTool.js'
import { JSReplTool } from './JSReplTool.js'

function createToolUseContext(toolNames: string[]) {
  let appState = getDefaultAppState()

  const setAppState = (updater: (prev: typeof appState) => typeof appState) => {
    appState = updater(appState)
  }

  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: '/data/models/hf/moonshotai__Kimi-K2.7-Code',
      tools: toolNames.map(name => ({ name, userFacingName: () => name })) as never,
      verbose: false,
      thinkingConfig: {} as never,
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: {
        activeAgents: [],
        allAgents: [],
      },
    },
    abortController: new AbortController(),
    readFileState: {} as never,
    getAppState: () => appState,
    setAppState,
    setAppStateForTasks: setAppState,
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
    messages: [],
  } as never
}

describe('js_repl kernel behavior', () => {
  it('persists state across calls and resets independently of the orchestration REPL', async () => {
    const toolUseContext = createToolUseContext(['js_repl', 'js_repl_reset'])

    const first = await JSReplTool.call!(
      {
        code: 'globalThis.counter = (globalThis.counter ?? 0) + 1; return globalThis.counter',
        timeout_ms: 1000,
      },
      toolUseContext,
      async () => ({ behavior: 'allow', updatedInput: {} }),
      {} as never,
    )

    const second = await JSReplTool.call!(
      {
        code: 'globalThis.counter = (globalThis.counter ?? 0) + 1; return globalThis.counter',
        timeout_ms: 1000,
      },
      toolUseContext,
      async () => ({ behavior: 'allow', updatedInput: {} }),
      {} as never,
    )

    expect(first.data.result).toBe(1)
    expect(second.data.result).toBe(2)
    expect(first.newMessages).toBeUndefined()
    expect(second.newMessages).toBeUndefined()

    const reset = await JSReplResetTool.call!(
      {},
      toolUseContext,
      async () => ({ behavior: 'allow', updatedInput: {} }),
      {} as never,
    )
    expect(reset.data.reset).toBe(true)

    const third = await JSReplTool.call!(
      {
        code: 'globalThis.counter = (globalThis.counter ?? 0) + 1; return globalThis.counter',
        timeout_ms: 1000,
      },
      toolUseContext,
      async () => ({ behavior: 'allow', updatedInput: {} }),
      {} as never,
    )

    expect(third.data.result).toBe(1)
  })
})
