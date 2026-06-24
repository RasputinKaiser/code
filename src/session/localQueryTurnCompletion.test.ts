import { describe, expect, it } from 'bun:test'
import {
  captureTurnBudgetInfo,
  planTurnDurationMessage,
} from './localQueryTurnCompletion.js'

describe('captureTurnBudgetInfo', () => {
  it('captures budget info only for non-aborted turns with a positive budget', () => {
    expect(
      captureTurnBudgetInfo({
        currentTurnTokenBudget: 1200,
        turnOutputTokens: 900,
        budgetContinuationCount: 2,
        wasAborted: false,
      }),
    ).toEqual({
      tokens: 900,
      limit: 1200,
      nudges: 2,
    })

    expect(
      captureTurnBudgetInfo({
        currentTurnTokenBudget: 1200,
        turnOutputTokens: 900,
        budgetContinuationCount: 2,
        wasAborted: true,
      }),
    ).toBeUndefined()
  })
})

describe('planTurnDurationMessage', () => {
  it('returns none for short turns without budget info and for proactively hidden turns', () => {
    expect(
      planTurnDurationMessage({
        nowMs: 10_000,
        loadingStartTimeMs: 0,
        totalPausedMs: 0,
        wasAborted: false,
        proactiveActive: false,
        hasRunningSwarmAgents: false,
        budgetInfo: undefined,
        minDurationMs: 30_000,
      }),
    ).toEqual({ kind: 'none' })

    expect(
      planTurnDurationMessage({
        nowMs: 50_000,
        loadingStartTimeMs: 0,
        totalPausedMs: 0,
        wasAborted: false,
        proactiveActive: true,
        hasRunningSwarmAgents: false,
        budgetInfo: { tokens: 100, limit: 200, nudges: 1 },
        minDurationMs: 30_000,
      }),
    ).toEqual({ kind: 'none' })
  })

  it('defers the turn duration when swarm agents are still running', () => {
    expect(
      planTurnDurationMessage({
        nowMs: 45_000,
        loadingStartTimeMs: 1_000,
        totalPausedMs: 5_000,
        wasAborted: false,
        proactiveActive: false,
        hasRunningSwarmAgents: true,
        budgetInfo: { tokens: 300, limit: 500, nudges: 1 },
        minDurationMs: 30_000,
      }),
    ).toEqual({
      kind: 'defer',
      startedAtMs: 1_000,
      budgetInfo: { tokens: 300, limit: 500, nudges: 1 },
    })
  })

  it('appends the turn duration once the turn is complete or budget info requires it', () => {
    expect(
      planTurnDurationMessage({
        nowMs: 40_000,
        loadingStartTimeMs: 0,
        totalPausedMs: 2_500,
        wasAborted: false,
        proactiveActive: false,
        hasRunningSwarmAgents: false,
        budgetInfo: undefined,
        minDurationMs: 30_000,
      }),
    ).toEqual({
      kind: 'append',
      durationMs: 37_500,
      budgetInfo: undefined,
    })

    expect(
      planTurnDurationMessage({
        nowMs: 5_000,
        loadingStartTimeMs: 0,
        totalPausedMs: 0,
        wasAborted: false,
        proactiveActive: false,
        hasRunningSwarmAgents: false,
        budgetInfo: { tokens: 300, limit: 500, nudges: 1 },
        minDurationMs: 30_000,
      }),
    ).toEqual({
      kind: 'append',
      durationMs: 5_000,
      budgetInfo: { tokens: 300, limit: 500, nudges: 1 },
    })
  })
})
