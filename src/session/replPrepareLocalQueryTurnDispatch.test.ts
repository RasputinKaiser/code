import { afterEach, describe, expect, mock, test } from 'bun:test'

afterEach(() => {
  mock.restore()
})

describe('dispatchReplPrepareLocalQueryTurn', () => {
  test('runs turn preflight, prepared-turn assembly, and checkpoint/reset sequencing', async () => {
    const events: string[] = []
    const preparedTurn = { params: { querySource: 'repl' } } as any

    const prepPaths = [
      import.meta.resolve('./localQueryTurnPreparation.ts'),
      import.meta.resolve('./localQueryTurnPreparation.js'),
    ]
    const actualPreparation = await import(
      import.meta.resolve('./localQueryTurnPreparation.ts')
    )
    for (const path of prepPaths) {
      mock.module(path, () => ({
        ...actualPreparation,
        prepareLocalQueryEngineTurn: async () => {
          events.push('prepare')
          return preparedTurn
        },
      }))
    }

    const bypassPaths = [
      import.meta.resolve('../utils/permissions/bypassPermissionsKillswitch.ts'),
      import.meta.resolve('../utils/permissions/bypassPermissionsKillswitch.js'),
    ]
    const actualBypassModule = await import(
      import.meta.resolve('../utils/permissions/bypassPermissionsKillswitch.ts')
    )
    for (const path of bypassPaths) {
      mock.module(path, () => ({
        ...actualBypassModule,
        checkAndDisableBypassPermissionsIfNeeded: async () => {
          events.push('bypass')
        },
        checkAndDisableAutoModeIfNeeded: async () => {
          events.push('auto')
        },
      }))
    }

    const { dispatchReplPrepareLocalQueryTurn } = await import(
      './replPrepareLocalQueryTurnDispatch.js'
    )

    const result = await dispatchReplPrepareLocalQueryTurn(
      {
        messages: [],
        newMessages: [],
        abortController: new AbortController(),
        mainLoopModel: 'model-x',
        toolPermissionContext: {
          additionalWorkingDirectories: new Map(),
        } as never,
        mainThreadAgentDefinition: undefined,
        customSystemPrompt: undefined,
        appendSystemPrompt: undefined,
        canUseTool: undefined,
        querySource: 'repl' as never,
        effort: undefined,
        getExtraUserContext: undefined,
        setAppState: () => {},
        shouldCheckAutoMode: true,
        fastMode: false,
      },
      {
        getToolUseContext: () => ({} as never),
        getSystemPrompt: async () => [],
        getUserContext: async () => ({}),
        getSystemContext: async () => ({}),
        buildEffectiveSystemPrompt: () => ({ kind: 'system-prompt' } as never),
        queryCheckpoint: label => {
          events.push(`checkpoint:${label}`)
        },
        resetTurnHookDuration: () => {
          events.push('reset-hook')
        },
        resetTurnToolDuration: () => {
          events.push('reset-tool')
        },
        resetTurnClassifierDuration: () => {
          events.push('reset-classifier')
        },
      },
    )

    expect(result).toBe(preparedTurn)
    expect(events).toEqual([
      'checkpoint:query_context_loading_start',
      'bypass',
      'auto',
      'prepare',
      'checkpoint:query_context_loading_end',
      'checkpoint:query_query_start',
      'reset-hook',
      'reset-tool',
      'reset-classifier',
    ])
  })

  test('skips the auto-mode preflight when the gate is disabled', async () => {
    let autoChecks = 0

    const prepPaths = [
      import.meta.resolve('./localQueryTurnPreparation.ts'),
      import.meta.resolve('./localQueryTurnPreparation.js'),
    ]
    const actualPreparation = await import(
      import.meta.resolve('./localQueryTurnPreparation.ts')
    )
    for (const path of prepPaths) {
      mock.module(path, () => ({
        ...actualPreparation,
        prepareLocalQueryEngineTurn: async () => ({ params: {} } as never),
      }))
    }

    const bypassPaths = [
      import.meta.resolve('../utils/permissions/bypassPermissionsKillswitch.ts'),
      import.meta.resolve('../utils/permissions/bypassPermissionsKillswitch.js'),
    ]
    const actualBypassModule = await import(
      import.meta.resolve('../utils/permissions/bypassPermissionsKillswitch.ts')
    )
    for (const path of bypassPaths) {
      mock.module(path, () => ({
        ...actualBypassModule,
        checkAndDisableBypassPermissionsIfNeeded: async () => {},
        checkAndDisableAutoModeIfNeeded: async () => {
          autoChecks += 1
        },
      }))
    }

    const { dispatchReplPrepareLocalQueryTurn } = await import(
      './replPrepareLocalQueryTurnDispatch.js'
    )

    await dispatchReplPrepareLocalQueryTurn(
      {
        messages: [],
        newMessages: [],
        abortController: new AbortController(),
        mainLoopModel: 'model-x',
        toolPermissionContext: {
          additionalWorkingDirectories: new Map(),
        } as never,
        mainThreadAgentDefinition: undefined,
        customSystemPrompt: undefined,
        appendSystemPrompt: undefined,
        canUseTool: undefined,
        querySource: 'repl' as never,
        effort: undefined,
        getExtraUserContext: undefined,
        setAppState: () => {},
        shouldCheckAutoMode: false,
        fastMode: false,
      },
      {
        getToolUseContext: () => ({} as never),
        getSystemPrompt: async () => [],
        getUserContext: async () => ({}),
        getSystemContext: async () => ({}),
        buildEffectiveSystemPrompt: () => ({ kind: 'system-prompt' } as never),
        queryCheckpoint: () => {},
        resetTurnHookDuration: () => {},
        resetTurnToolDuration: () => {},
        resetTurnClassifierDuration: () => {},
      },
    )

    expect(autoChecks).toBe(0)
  })
})
