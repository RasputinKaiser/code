import {
  captureTurnBudgetInfo,
  planTurnDurationMessage,
  type TurnBudgetInfo,
} from './localQueryTurnCompletion.js'

export type FinalizeLocalQueryTurnOptions = {
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

export type FinalizeLocalQueryTurnDeps = {
  onBecameIdle: () => void
  resetLoadingState: () => void
  onTurnComplete: () => void | Promise<void>
  sendBridgeResult: () => void
  autoHideTungstenPanel: () => void
  clearTokenBudget: () => void
  onDeferTurnDuration: (
    startedAtMs: number,
    budgetInfo?: TurnBudgetInfo,
  ) => void
  onAppendTurnDuration: (
    durationMs: number,
    budgetInfo?: TurnBudgetInfo,
  ) => void
  clearAbortController: () => void
}

export async function finalizeLocalQueryTurn(
  options: FinalizeLocalQueryTurnOptions,
  deps: FinalizeLocalQueryTurnDeps,
): Promise<void> {
  deps.onBecameIdle()
  deps.resetLoadingState()
  await deps.onTurnComplete()
  deps.sendBridgeResult()
  deps.autoHideTungstenPanel()

  const budgetInfo = options.tokenBudgetEnabled
    ? captureTurnBudgetInfo({
        currentTurnTokenBudget: options.currentTurnTokenBudget,
        turnOutputTokens: options.turnOutputTokens,
        budgetContinuationCount: options.budgetContinuationCount,
        wasAborted: options.wasAborted,
      })
    : undefined

  if (options.tokenBudgetEnabled) {
    deps.clearTokenBudget()
  }

  const turnDurationPlan = planTurnDurationMessage({
    nowMs: Date.now(),
    loadingStartTimeMs: options.loadingStartTimeMs,
    totalPausedMs: options.totalPausedMs,
    budgetInfo,
    wasAborted: options.wasAborted,
    proactiveActive: options.proactiveActive,
    hasRunningSwarmAgents: options.hasRunningSwarmAgents,
  })

  if (turnDurationPlan.kind === 'defer') {
    deps.onDeferTurnDuration(
      turnDurationPlan.startedAtMs,
      turnDurationPlan.budgetInfo,
    )
  } else if (turnDurationPlan.kind === 'append') {
    deps.onAppendTurnDuration(
      turnDurationPlan.durationMs,
      turnDurationPlan.budgetInfo,
    )
  }

  deps.clearAbortController()
}
