import type { Message } from '../types/message.js'
import type { LocalApiMetricsSummary } from './localQueryTurnApiMetrics.js'
import type { PreparedLocalQueryEngineTurn } from './localQueryTurnPreparation.js'

export type RunLocalQueryTurnOrchestratorOptions = {
  newMessages: Message[]
  shouldQuery: boolean
  additionalAllowedTools: string[]
  onCompactBoundary?: () => void
}

export type RunLocalQueryTurnOrchestratorDeps = {
  syncAllowedTools: (additionalAllowedTools: string[]) => void
  skipLocalQueryTurn: (options: {
    newMessages: Message[]
    onCompactBoundary?: () => void
  }) => void
  prepareTurn: () => Promise<PreparedLocalQueryEngineTurn>
  executePreparedTurn: (
    preparedTurn: PreparedLocalQueryEngineTurn,
  ) => Promise<void>
  onAfterSuccessfulTurn?: () => void | Promise<void>
  buildApiMetricsSummary?: () => LocalApiMetricsSummary | undefined
  appendApiMetricsMessage?: (summary: LocalApiMetricsSummary) => void
  resetLoadingState: () => void
  logQueryProfileReport: () => void
  onTurnComplete?: () => void | Promise<void>
}

import { logForDebugging } from '../utils/debug.js'

export async function runLocalQueryTurnOrchestrator(
  options: RunLocalQueryTurnOrchestratorOptions,
  deps: RunLocalQueryTurnOrchestratorDeps,
): Promise<void> {
  deps.syncAllowedTools(options.additionalAllowedTools)

  if (!options.shouldQuery) {
    deps.skipLocalQueryTurn({
      newMessages: options.newMessages,
      onCompactBoundary: options.onCompactBoundary,
    })
    return
  }

  logForDebugging('[ncode-debug] orchestrator before prepareTurn')
  const preparedTurn = await deps.prepareTurn()
  logForDebugging('[ncode-debug] orchestrator prepared turn ready')
  logForDebugging('[ncode-debug] orchestrator before executePreparedTurn')
  await deps.executePreparedTurn(preparedTurn)
  logForDebugging('[ncode-debug] orchestrator after executePreparedTurn')
  await deps.onAfterSuccessfulTurn?.()

  const apiMetricsSummary = deps.buildApiMetricsSummary?.()
  if (apiMetricsSummary) {
    deps.appendApiMetricsMessage?.(apiMetricsSummary)
  }

  deps.resetLoadingState()
  deps.logQueryProfileReport()
  await deps.onTurnComplete?.()
}
