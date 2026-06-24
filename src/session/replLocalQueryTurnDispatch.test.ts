import { afterEach, describe, expect, test } from 'bun:test'

import type { Message } from '../types/message.js'
import {
  createReplLocalQueryTurnDispatch,
} from './replLocalQueryTurnDispatch.js'

const originalUserType = process.env.USER_TYPE

function createDeps(overrides: Partial<Parameters<typeof createReplLocalQueryTurnDispatch>[0]> = {}) {
  const messagesRef = {
    current: [
      {
        type: 'user',
        uuid: 'u1',
        isMeta: false,
        message: { content: 'hello' },
      } as unknown as Message,
    ],
  }
  const appendedMessages: Message[] = []
  let companionReaction: string | null = null
  const checkpoints: string[] = []
  let turnCompleteMessages: Message[] | null = null
  let loadingReset = 0
  let abortController: AbortController | null = new AbortController()
  const storeState = {
    toolPermissionContext: {
      alwaysAllowRules: {},
    },
  }

  const deps = {
    store: {
      setState: (updater: (prev: typeof storeState) => typeof storeState) => {
        Object.assign(storeState, updater(storeState))
      },
    },
    resetLoadingState: () => {
      loadingReset += 1
    },
    setAbortController: (value: AbortController | null) => {
      abortController = value
    },
    executePreparedTurnImpl: async (
      _preparedTurn: unknown,
      _onEvent: (event: unknown) => void,
    ) => {},
    onQueryEvent: (_event: unknown) => {},
    buddyEnabled: false,
    observeCompanion: (_messages: Message[], _onReaction: (reaction: string) => void) => {},
    setCompanionReaction: (reaction: string) => {
      companionReaction = reaction
    },
    queryCheckpoint: (label: string) => {
      checkpoints.push(label)
    },
    userType: process.env.USER_TYPE,
    apiMetricsRef: {
      current: [],
    },
    getHookDurationMs: () => 0,
    getHookCount: () => 0,
    getToolDurationMs: () => 0,
    getToolCount: () => 0,
    getClassifierDurationMs: () => 0,
    getClassifierCount: () => 0,
    getConfigWriteCount: () => 0,
    loadingStartTimeMsRef: { current: Date.now() },
    appendMessage: (message: Message) => {
      appendedMessages.push(message)
    },
    messagesRef,
    onTurnComplete: async (messages: Message[]) => {
      turnCompleteMessages = messages
    },
    ...overrides,
  }

  return {
    deps,
    storeState,
    getAbortController: () => abortController,
    getLoadingResetCount: () => loadingReset,
    getAppendedMessages: () => appendedMessages,
    getCompanionReaction: () => companionReaction,
    getCheckpoints: () => checkpoints,
    getTurnCompleteMessages: () => turnCompleteMessages,
  }
}

describe('createReplLocalQueryTurnDispatch', () => {
  afterEach(() => {
    if (originalUserType === undefined) {
      delete process.env.USER_TYPE
    } else {
      process.env.USER_TYPE = originalUserType
    }
  })

  test('syncs allowed tools and preserves skipped-turn cleanup ordering', () => {
    const {
      deps,
      storeState,
      getAbortController,
      getLoadingResetCount,
    } = createDeps()
    const dispatch = createReplLocalQueryTurnDispatch(deps)
    let compactBoundaryCalls = 0

    dispatch.syncAllowedTools(['git', 'hg'])
    dispatch.skipLocalQueryTurn({
      newMessages: [
        {
          type: 'system',
          subtype: 'compact_boundary',
        } as unknown as Message,
      ],
      onCompactBoundary: () => {
        compactBoundaryCalls += 1
      },
    })

    expect(storeState.toolPermissionContext.alwaysAllowRules.command).toEqual([
      'git',
      'hg',
    ])
    expect(compactBoundaryCalls).toBe(1)
    expect(getLoadingResetCount()).toBe(1)
    expect(getAbortController()).toBeNull()
  })

  test('executes prepared turns through the provided event hook', async () => {
    const events: unknown[] = []
    const preparedTurn = { params: { model: 'gpt-test' } } as any
    const { deps } = createDeps({
      executePreparedTurnImpl: async (nextPreparedTurn, onEvent) => {
        expect(nextPreparedTurn).toBe(preparedTurn)
        onEvent({ type: 'response_length', responseLength: 3 })
      },
      onQueryEvent: event => {
        events.push(event)
      },
    })
    const dispatch = createReplLocalQueryTurnDispatch(deps)

    await dispatch.executePreparedTurn(preparedTurn)

    expect(events).toEqual([
      {
        type: 'response_length',
        responseLength: 3,
      },
    ])
  })

  test('preserves buddy, api-metrics, append, and turn-complete semantics', async () => {
    process.env.USER_TYPE = 'ant'
    const now = Date.now()
    const originalNow = Date.now
    Date.now = () => now

    try {
      const {
        deps,
        getAppendedMessages,
        getCompanionReaction,
        getCheckpoints,
        getTurnCompleteMessages,
      } = createDeps({
        buddyEnabled: true,
        observeCompanion: (messages, onReaction) => {
          expect(messages).toHaveLength(1)
          onReaction('thinking')
        },
        apiMetricsRef: {
          current: [
            {
              ttftMs: 50,
              firstTokenTime: now - 200,
              lastTokenTime: now - 100,
              responseLengthBaseline: 0,
              endResponseLength: 40,
            },
          ],
        },
        getHookDurationMs: () => 12,
        getHookCount: () => 1,
        getToolDurationMs: () => 7,
        getToolCount: () => 1,
        getClassifierDurationMs: () => 3,
        getClassifierCount: () => 1,
        getConfigWriteCount: () => 2,
        loadingStartTimeMsRef: { current: now - 500 },
      })
      const dispatch = createReplLocalQueryTurnDispatch(deps)

      await dispatch.onAfterSuccessfulTurn()
      const summary = dispatch.buildApiMetricsSummary()
      expect(summary).toMatchObject({
        ttftMs: 50,
        otps: 100,
        isP50: false,
        hookDurationMs: 12,
        hookCount: 1,
        toolDurationMs: 7,
        toolCount: 1,
        classifierDurationMs: 3,
        classifierCount: 1,
        turnDurationMs: 500,
        configWriteCount: 2,
      })
      dispatch.appendApiMetricsMessage(summary!)
      await dispatch.onTurnComplete()

      expect(getCompanionReaction()).toBe('thinking')
      expect(getCheckpoints()).toEqual(['query_end'])
      expect(getAppendedMessages()).toHaveLength(1)
      expect(getAppendedMessages()[0]).toMatchObject({
        type: 'system',
        subtype: 'api_metrics',
      })
      expect(getTurnCompleteMessages()).toEqual(deps.messagesRef.current)
    } finally {
      Date.now = originalNow
    }
  })
})
