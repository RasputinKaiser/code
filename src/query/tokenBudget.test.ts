import { describe, expect, it } from 'bun:test'

import {
  checkTokenBudget,
  createBudgetTracker,
  type BudgetTracker,
} from './tokenBudget.js'

function cloneTracker(tracker: BudgetTracker): BudgetTracker {
  return { ...tracker }
}

describe('checkTokenBudget', () => {
  it('treats agent and disabled budgets as plain stops without mutating tracker state', () => {
    const cases: Array<[string | undefined, number | null]> = [
      ['agent-1', 1_000],
      [undefined, null],
      [undefined, 0],
      [undefined, -1],
    ]

    for (const [agentId, budget] of cases) {
      const tracker: BudgetTracker = {
        continuationCount: 2,
        lastDeltaTokens: 125,
        lastGlobalTurnTokens: 250,
        startedAt: Date.now() - 500,
      }
      const original = cloneTracker(tracker)

      expect(checkTokenBudget(tracker, agentId, budget, 900)).toEqual({
        action: 'stop',
        completionEvent: null,
      })
      expect(tracker).toEqual(original)
    }
  })

  it('continues below the threshold and records the latest token delta', () => {
    const tracker = createBudgetTracker()

    const decision = checkTokenBudget(tracker, undefined, 1_000, 400)

    expect(decision).toMatchObject({
      action: 'continue',
      continuationCount: 1,
      pct: 40,
      turnTokens: 400,
      budget: 1_000,
    })
    expect(decision.nudgeMessage).toContain('40%')
    expect(tracker).toMatchObject({
      continuationCount: 1,
      lastDeltaTokens: 400,
      lastGlobalTurnTokens: 400,
    })
  })

  it('does not emit a completion event if the turn starts already over threshold', () => {
    const tracker = createBudgetTracker()

    expect(checkTokenBudget(tracker, undefined, 1_000, 950)).toEqual({
      action: 'stop',
      completionEvent: null,
    })
  })

  it('emits a completion summary after a prior continuation reaches the threshold', () => {
    const tracker = createBudgetTracker()
    checkTokenBudget(tracker, undefined, 1_000, 400)
    tracker.startedAt = Date.now() - 2_500

    const decision = checkTokenBudget(tracker, undefined, 1_000, 950)

    expect(decision.action).toBe('stop')
    expect(decision.completionEvent).toMatchObject({
      continuationCount: 1,
      pct: 95,
      turnTokens: 950,
      budget: 1_000,
      diminishingReturns: false,
    })
    expect(decision.completionEvent?.durationMs).toBeGreaterThanOrEqual(2_400)
  })

  it('stops for diminishing returns after repeated small deltas even below threshold', () => {
    const tracker: BudgetTracker = {
      continuationCount: 3,
      lastDeltaTokens: 300,
      lastGlobalTurnTokens: 1_000,
      startedAt: Date.now() - 900,
    }

    const decision = checkTokenBudget(tracker, undefined, 5_000, 1_200)

    expect(decision.action).toBe('stop')
    expect(decision.completionEvent).toMatchObject({
      continuationCount: 3,
      pct: 24,
      turnTokens: 1_200,
      budget: 5_000,
      diminishingReturns: true,
    })
  })
})
