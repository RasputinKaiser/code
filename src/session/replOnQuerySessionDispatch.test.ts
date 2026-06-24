import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { AppState } from '../state/AppState.js'
import type { Message, UserMessage } from '../types/message.js'
import {
  dispatchReplFinalizeCurrentTurn,
  resolveReplCanceledTurnRestoreMessage,
} from './replOnQuerySessionDispatch.js'

const originalUserType = process.env.USER_TYPE
const originalBuildMode = process.env.NCODE_BUILD_MODE

function createUserMessage(uuid: string): UserMessage {
  return {
    type: 'user',
    uuid,
    isMeta: false,
    message: {
      content: 'hello',
    },
  } as unknown as UserMessage
}

describe('replOnQuerySessionDispatch', () => {
  beforeEach(() => {
    process.env.USER_TYPE = 'noumena'
    delete process.env.NCODE_BUILD_MODE
  })

  afterEach(() => {
    if (originalUserType === undefined) {
      delete process.env.USER_TYPE
    } else {
      process.env.USER_TYPE = originalUserType
    }
    if (originalBuildMode === undefined) {
      delete process.env.NCODE_BUILD_MODE
    } else {
      process.env.NCODE_BUILD_MODE = originalBuildMode
    }
  })

  test('dispatchReplFinalizeCurrentTurn preserves idle, tungsten, duration, and abort cleanup semantics', async () => {
    const abortController = new AbortController()
    const messagesRef = {
      current: [
        createUserMessage('u1'),
        { type: 'progress', uuid: 'p1' } as unknown as Message,
      ] as Message[],
    }
    let currentMessages = messagesRef.current
    let appState = {
      tungstenActiveSession: 'tmux-session',
      tungstenPanelAutoHidden: false,
    } as AppState
    let lastQueryCompletionTime = 0
    let turnCompleteArgs: { messages: Message[]; wasAborted: boolean } | null =
      null
    let bridgeResults = 0
    let tokenBudgetClears = 0
    let abortClears = 0
    const swarmStartTimeRef = { current: null as number | null }
    const swarmBudgetInfoRef = {
      current: undefined as
        | { tokens: number; limit: number; nudges: number }
        | undefined,
    }
    let capturedOptions:
      | {
          wasAborted: boolean
          loadingStartTimeMs: number
          totalPausedMs: number
          proactiveActive: boolean
          hasRunningSwarmAgents: boolean
          tokenBudgetEnabled: boolean
          currentTurnTokenBudget: number | null
          turnOutputTokens: number
          budgetContinuationCount: number
        }
      | undefined

    await dispatchReplFinalizeCurrentTurn(
      {
        abortController,
        wasAborted: false,
        loadingStartTimeMs: 10,
        totalPausedMs: 4,
        proactiveActive: false,
        hasRunningSwarmAgents: true,
        tokenBudgetEnabled: true,
        currentTurnTokenBudget: 100,
        turnOutputTokens: 12,
        budgetContinuationCount: 2,
      },
      {
        setLastQueryCompletionTime: value => {
          lastQueryCompletionTime = value
        },
        skipIdleCheckRef: { current: true },
        resetLoadingState: () => {},
        mrOnTurnComplete: async (messages, wasAborted) => {
          turnCompleteArgs = { messages, wasAborted }
        },
        messagesRef,
        sendBridgeResult: () => {
          bridgeResults += 1
        },
        setAppState: action => {
          appState =
            typeof action === 'function'
              ? action(appState)
              : (action as AppState)
          return appState
        },
        clearTokenBudget: () => {
          tokenBudgetClears += 1
        },
        swarmStartTimeRef,
        swarmBudgetInfoRef,
        setMessages: action => {
          currentMessages =
            typeof action === 'function'
              ? action(currentMessages)
              : (action as Message[])
          messagesRef.current = currentMessages
          return currentMessages
        },
        clearAbortController: () => {
          abortClears += 1
        },
      },
      {
        finalizeTurn: async (options, deps) => {
          capturedOptions = options
          deps.onBecameIdle()
          await deps.onTurnComplete()
          deps.sendBridgeResult()
          deps.autoHideTungstenPanel()
          deps.clearTokenBudget()
          deps.onDeferTurnDuration(123, {
            tokens: 7,
            limit: 100,
            nudges: 2,
          })
          deps.onAppendTurnDuration(250, {
            tokens: 7,
            limit: 100,
            nudges: 2,
          })
          deps.clearAbortController()
        },
      },
    )

    expect(capturedOptions).toEqual({
      wasAborted: false,
      loadingStartTimeMs: 10,
      totalPausedMs: 4,
      proactiveActive: false,
      hasRunningSwarmAgents: true,
      tokenBudgetEnabled: true,
      currentTurnTokenBudget: 100,
      turnOutputTokens: 12,
      budgetContinuationCount: 2,
    })
    expect(lastQueryCompletionTime).toBeGreaterThan(0)
    expect(turnCompleteArgs).toEqual({
      messages: [
        createUserMessage('u1'),
        { type: 'progress', uuid: 'p1' } as unknown as Message,
      ],
      wasAborted: false,
    })
    expect(bridgeResults).toBe(1)
    expect(tokenBudgetClears).toBe(1)
    expect(abortClears).toBe(1)
    expect(appState.tungstenPanelAutoHidden).toBe(true)
    expect(swarmStartTimeRef.current).toBe(123)
    expect(swarmBudgetInfoRef.current).toEqual({
      tokens: 7,
      limit: 100,
      nudges: 2,
    })
    expect(currentMessages).toHaveLength(3)
    expect(currentMessages[2]).toMatchObject({
      type: 'system',
      subtype: 'turn_duration',
      durationMs: 250,
      budgetTokens: 7,
      budgetLimit: 100,
      budgetNudges: 2,
      messageCount: 1,
    })
  })

  test('dispatchReplFinalizeCurrentTurn preserves tungsten auto-hide guards', async () => {
    const abortController = new AbortController()
    abortController.abort('user-cancel')
    let appState = {
      tungstenActiveSession: 'tmux-session',
      tungstenPanelAutoHidden: false,
    } as AppState

    await dispatchReplFinalizeCurrentTurn(
      {
        abortController,
        wasAborted: true,
        loadingStartTimeMs: 10,
        totalPausedMs: 0,
        proactiveActive: false,
        hasRunningSwarmAgents: false,
        tokenBudgetEnabled: false,
        currentTurnTokenBudget: null,
        turnOutputTokens: 0,
        budgetContinuationCount: 0,
      },
      {
        setLastQueryCompletionTime: () => {},
        skipIdleCheckRef: { current: true },
        resetLoadingState: () => {},
        mrOnTurnComplete: async () => {},
        messagesRef: { current: [] },
        sendBridgeResult: () => {},
        setAppState: action => {
          appState =
            typeof action === 'function'
              ? action(appState)
              : (action as AppState)
          return appState
        },
        clearTokenBudget: () => {},
        swarmStartTimeRef: { current: null },
        swarmBudgetInfoRef: { current: undefined },
        setMessages: action =>
          typeof action === 'function' ? action([]) : (action as Message[]),
        clearAbortController: () => {},
      },
      {
        finalizeTurn: async (_options, deps) => {
          deps.autoHideTungstenPanel()
        },
      },
    )

    expect(appState.tungstenPanelAutoHidden).toBe(false)
  })

  test('dispatchReplFinalizeCurrentTurn does not auto-hide tungsten for legacy ant user type', async () => {
    delete process.env.NCODE_BUILD_MODE
    process.env.USER_TYPE = 'ant'
    const abortController = new AbortController()
    let appState = {
      tungstenActiveSession: 'tmux-session',
      tungstenPanelAutoHidden: false,
    } as AppState

    await dispatchReplFinalizeCurrentTurn(
      {
        abortController,
        wasAborted: false,
        loadingStartTimeMs: 10,
        totalPausedMs: 0,
        proactiveActive: false,
        hasRunningSwarmAgents: false,
        tokenBudgetEnabled: false,
        currentTurnTokenBudget: null,
        turnOutputTokens: 0,
        budgetContinuationCount: 0,
      },
      {
        setLastQueryCompletionTime: () => {},
        skipIdleCheckRef: { current: true },
        resetLoadingState: () => {},
        mrOnTurnComplete: async () => {},
        messagesRef: { current: [] },
        sendBridgeResult: () => {},
        setAppState: action => {
          appState =
            typeof action === 'function'
              ? action(appState)
              : (action as AppState)
          return appState
        },
        clearTokenBudget: () => {},
        swarmStartTimeRef: { current: null },
        swarmBudgetInfoRef: { current: undefined },
        setMessages: action =>
          typeof action === 'function' ? action([]) : (action as Message[]),
        clearAbortController: () => {},
      },
      {
        finalizeTurn: async (_options, deps) => {
          deps.autoHideTungstenPanel()
        },
      },
    )

    expect(appState.tungstenPanelAutoHidden).toBe(false)
  })

  test('resolveReplCanceledTurnRestoreMessage forwards the live REPL restore context', () => {
    const abortController = new AbortController()
    abortController.abort('user-cancel')
    const messages = [createUserMessage('u1')] as Message[]
    const captured: Record<string, unknown>[] = []
    const expected = createUserMessage('u1')

    const restored = resolveReplCanceledTurnRestoreMessage(
      abortController,
      {
        isQueryActive: false,
        inputValue: '',
        commandQueueLength: 0,
        viewingAgentTaskId: null,
        messages,
        isSelectableUserMessage: (
          message: Message,
        ): message is UserMessage => message.type === 'user',
        messagesAfterAreOnlySynthetic: (_messages, _index) => true,
      },
      {
        resolveCanceledTurnRestoreMessage: options => {
          captured.push(options as Record<string, unknown>)
          return expected
        },
      },
    )

    expect(restored).toBe(expected)
    expect(captured).toEqual([
      {
        abortReason: 'user-cancel',
        isQueryActive: false,
        inputValue: '',
        commandQueueLength: 0,
        viewingAgentTaskId: null,
        messages,
        isSelectableUserMessage: expect.any(Function),
        messagesAfterAreOnlySynthetic: expect.any(Function),
      },
    ])
  })
})
