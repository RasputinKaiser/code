import type { Message } from '../types/message.js'
import type { LocalApiMetricsSummary } from './localQueryTurnApiMetrics.js'
import type { PreparedLocalQueryEngineTurn } from './localQueryTurnPreparation.js'
import { runLocalQueryTurnOrchestrator } from './localQueryTurnOrchestrator.js'
import { logForDebugging } from '../utils/debug.js'

export type DispatchReplLocalQueryRunOptions = {
  newMessages: Message[]
  shouldQuery: boolean
  additionalAllowedTools: string[]
  onCompactBoundary?: () => void
}

type LocalQueryTurnDispatch = {
  syncAllowedTools: (additionalAllowedTools: string[]) => void
  skipLocalQueryTurn: (options: {
    newMessages: Message[]
    onCompactBoundary?: () => void
  }) => void
  executePreparedTurn: (
    preparedTurn: PreparedLocalQueryEngineTurn,
  ) => Promise<void>
  onAfterSuccessfulTurn?: () => void | Promise<void>
  buildApiMetricsSummary?: () => LocalApiMetricsSummary | undefined
  appendApiMetricsMessage?: (summary: LocalApiMetricsSummary) => void
  onTurnComplete?: () => void | Promise<void>
}

export type DispatchReplLocalQueryRunDeps = {
  runPrelude: () => void
  createLocalTurnDispatch: () => LocalQueryTurnDispatch
  prepareTurn: () => Promise<PreparedLocalQueryEngineTurn>
  resetLoadingState: () => void
  logQueryProfileReport: () => void
}

export async function dispatchReplLocalQueryRun(
  options: DispatchReplLocalQueryRunOptions,
  deps: DispatchReplLocalQueryRunDeps,
): Promise<void> {
  deps.runPrelude()

  const localQueryTurnDispatch = deps.createLocalTurnDispatch()
  logForDebugging('[ncode-debug] localQueryRun before orchestrator')
  await runLocalQueryTurnOrchestrator(
    {
      newMessages: options.newMessages,
      shouldQuery: options.shouldQuery,
      additionalAllowedTools: options.additionalAllowedTools,
      onCompactBoundary: options.onCompactBoundary,
    },
    {
      syncAllowedTools: localQueryTurnDispatch.syncAllowedTools,
      skipLocalQueryTurn: localQueryTurnDispatch.skipLocalQueryTurn,
      prepareTurn: deps.prepareTurn,
      executePreparedTurn: localQueryTurnDispatch.executePreparedTurn,
      onAfterSuccessfulTurn: localQueryTurnDispatch.onAfterSuccessfulTurn,
      buildApiMetricsSummary: localQueryTurnDispatch.buildApiMetricsSummary,
      appendApiMetricsMessage: localQueryTurnDispatch.appendApiMetricsMessage,
      resetLoadingState: deps.resetLoadingState,
      logQueryProfileReport: deps.logQueryProfileReport,
      onTurnComplete: localQueryTurnDispatch.onTurnComplete,
    },
  )
  logForDebugging('[ncode-debug] localQueryRun after orchestrator')
}
