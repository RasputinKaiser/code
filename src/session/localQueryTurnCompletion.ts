export type TurnBudgetInfo = {
  tokens: number
  limit: number
  nudges: number
}

export function captureTurnBudgetInfo(options: {
  currentTurnTokenBudget: number | null
  turnOutputTokens: number
  budgetContinuationCount: number
  wasAborted: boolean
}): TurnBudgetInfo | undefined {
  const {
    currentTurnTokenBudget,
    turnOutputTokens,
    budgetContinuationCount,
    wasAborted,
  } = options

  if (
    currentTurnTokenBudget === null ||
    currentTurnTokenBudget <= 0 ||
    wasAborted
  ) {
    return undefined
  }

  return {
    tokens: turnOutputTokens,
    limit: currentTurnTokenBudget,
    nudges: budgetContinuationCount,
  }
}

export type TurnDurationPlan =
  | { kind: 'none' }
  | {
      kind: 'append'
      durationMs: number
      budgetInfo?: TurnBudgetInfo
    }
  | {
      kind: 'defer'
      startedAtMs: number
      budgetInfo?: TurnBudgetInfo
    }

export function planTurnDurationMessage(options: {
  nowMs: number
  loadingStartTimeMs: number
  totalPausedMs: number
  budgetInfo?: TurnBudgetInfo
  wasAborted: boolean
  proactiveActive: boolean
  hasRunningSwarmAgents: boolean
  minDurationMs?: number
}): TurnDurationPlan {
  const {
    nowMs,
    loadingStartTimeMs,
    totalPausedMs,
    budgetInfo,
    wasAborted,
    proactiveActive,
    hasRunningSwarmAgents,
    minDurationMs = 30000,
  } = options

  const durationMs = nowMs - loadingStartTimeMs - totalPausedMs
  if (
    (durationMs <= minDurationMs && budgetInfo === undefined) ||
    wasAborted ||
    proactiveActive
  ) {
    return { kind: 'none' }
  }

  if (hasRunningSwarmAgents) {
    return {
      kind: 'defer',
      startedAtMs: loadingStartTimeMs,
      budgetInfo,
    }
  }

  return {
    kind: 'append',
    durationMs,
    budgetInfo,
  }
}
