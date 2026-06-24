import { afterEach, describe, expect, it } from 'bun:test'
import { finalizeLocalQueryTurn } from './localQueryTurnFinalization.js'

const originalDateNow = Date.now

afterEach(() => {
  Date.now = originalDateNow
})

describe('finalizeLocalQueryTurn', () => {
  it('awaits onTurnComplete before bridge completion work and defers duration for active swarm agents', async () => {
    Date.now = () => 60_000

    const callOrder: string[] = []
    let resolveTurnComplete: (() => void) | undefined
    const turnCompletePromise = new Promise<void>(resolve => {
      resolveTurnComplete = resolve
    })

    const finalizePromise = finalizeLocalQueryTurn(
      {
        wasAborted: false,
        loadingStartTimeMs: 10_000,
        totalPausedMs: 5_000,
        proactiveActive: false,
        hasRunningSwarmAgents: true,
        tokenBudgetEnabled: true,
        currentTurnTokenBudget: 1_200,
        turnOutputTokens: 900,
        budgetContinuationCount: 2,
      },
      {
        onBecameIdle: () => {
          callOrder.push('idle')
        },
        resetLoadingState: () => {
          callOrder.push('reset')
        },
        onTurnComplete: async () => {
          callOrder.push('turn-complete:start')
          await turnCompletePromise
          callOrder.push('turn-complete:end')
        },
        sendBridgeResult: () => {
          callOrder.push('bridge')
        },
        autoHideTungstenPanel: () => {
          callOrder.push('hide-panel')
        },
        clearTokenBudget: () => {
          callOrder.push('clear-budget')
        },
        onDeferTurnDuration: (startedAtMs, budgetInfo) => {
          callOrder.push(
            `defer:${startedAtMs}:${budgetInfo?.tokens}:${budgetInfo?.limit}:${budgetInfo?.nudges}`,
          )
        },
        onAppendTurnDuration: () => {
          callOrder.push('append')
        },
        clearAbortController: () => {
          callOrder.push('clear-abort')
        },
      },
    )

    await Promise.resolve()

    expect(callOrder).toEqual(['idle', 'reset', 'turn-complete:start'])

    resolveTurnComplete?.()
    await finalizePromise

    expect(callOrder).toEqual([
      'idle',
      'reset',
      'turn-complete:start',
      'turn-complete:end',
      'bridge',
      'hide-panel',
      'clear-budget',
      'defer:10000:900:1200:2',
      'clear-abort',
    ])
  })

  it('appends duration and skips budget cleanup when token budgeting is disabled', async () => {
    Date.now = () => 40_000

    const appended: Array<{
      durationMs: number
      budgetInfo: unknown
    }> = []
    let clearBudgetCalls = 0
    let deferCalls = 0

    await finalizeLocalQueryTurn(
      {
        wasAborted: false,
        loadingStartTimeMs: 0,
        totalPausedMs: 2_000,
        proactiveActive: false,
        hasRunningSwarmAgents: false,
        tokenBudgetEnabled: false,
        currentTurnTokenBudget: 1_200,
        turnOutputTokens: 900,
        budgetContinuationCount: 2,
      },
      {
        onBecameIdle: () => {},
        resetLoadingState: () => {},
        onTurnComplete: async () => {},
        sendBridgeResult: () => {},
        autoHideTungstenPanel: () => {},
        clearTokenBudget: () => {
          clearBudgetCalls += 1
        },
        onDeferTurnDuration: () => {
          deferCalls += 1
        },
        onAppendTurnDuration: (durationMs, budgetInfo) => {
          appended.push({ durationMs, budgetInfo })
        },
        clearAbortController: () => {},
      },
    )

    expect(clearBudgetCalls).toBe(0)
    expect(deferCalls).toBe(0)
    expect(appended).toEqual([
      {
        durationMs: 38_000,
        budgetInfo: undefined,
      },
    ])
  })
})
