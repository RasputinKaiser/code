import type { MutableRefObject } from 'react'

import type { Message } from '../types/message.js'
import { createApiMetricsMessage } from '../utils/messages.js'
import type { LocalQueryEvent } from './applyLocalQueryEvent.js'
import {
  buildLocalApiMetricsSummary,
  type LocalApiMetricsEntry,
  type LocalApiMetricsSummary,
} from './localQueryTurnApiMetrics.js'
import type { PreparedLocalQueryEngineTurn } from './localQueryTurnPreparation.js'
import {
  handleSkippedLocalQueryTurn,
  syncAllowedToolsForTurn,
} from './localQueryTurnState.js'

type CommandAllowRulesState = {
  toolPermissionContext: {
    alwaysAllowRules: {
      command?: string[]
    }
  }
}

type CommandAllowRulesStore<TState extends CommandAllowRulesState> = {
  setState: (updater: (prev: TState) => TState) => void
}

type CreateReplLocalQueryTurnDispatchDeps<
  TState extends CommandAllowRulesState,
> = {
  store: CommandAllowRulesStore<TState>
  resetLoadingState: () => void
  setAbortController: (abortController: AbortController | null) => void
  executePreparedTurnImpl: (
    preparedTurn: PreparedLocalQueryEngineTurn,
    onEvent: (event: LocalQueryEvent) => void,
  ) => Promise<void>
  onQueryEvent: (event: LocalQueryEvent) => void
  buddyEnabled: boolean
  observeCompanion: (
    messages: Message[],
    onReaction: (reaction: string) => void,
  ) => void | Promise<void>
  setCompanionReaction: (reaction: string) => void
  queryCheckpoint: (label: string) => void
  userType: string | undefined
  apiMetricsRef: MutableRefObject<LocalApiMetricsEntry[]>
  getHookDurationMs: () => number
  getHookCount: () => number
  getToolDurationMs: () => number
  getToolCount: () => number
  getClassifierDurationMs: () => number
  getClassifierCount: () => number
  getConfigWriteCount: () => number
  loadingStartTimeMsRef: MutableRefObject<number>
  appendMessage: (message: Message) => void
  messagesRef: MutableRefObject<Message[]>
  onTurnComplete?: (messages: Message[]) => void | Promise<void>
}

export function createReplLocalQueryTurnDispatch<
  TState extends CommandAllowRulesState,
>(deps: CreateReplLocalQueryTurnDispatchDeps<TState>) {
  return {
    syncAllowedTools: (additionalAllowedTools: string[]) => {
      syncAllowedToolsForTurn(deps.store, additionalAllowedTools)
    },
    skipLocalQueryTurn: (options: {
      newMessages: Message[]
      onCompactBoundary?: () => void
    }) => {
      handleSkippedLocalQueryTurn({
        newMessages: options.newMessages,
        resetLoadingState: deps.resetLoadingState,
        setAbortController: deps.setAbortController,
        onCompactBoundary: options.onCompactBoundary,
      })
    },
    executePreparedTurn: (preparedTurn: PreparedLocalQueryEngineTurn) =>
      deps.executePreparedTurnImpl(preparedTurn, deps.onQueryEvent),
    onAfterSuccessfulTurn: async () => {
      if (deps.buddyEnabled) {
        void deps.observeCompanion(
          deps.messagesRef.current,
          deps.setCompanionReaction,
        )
      }
      deps.queryCheckpoint('query_end')
    },
    buildApiMetricsSummary: (): LocalApiMetricsSummary | undefined => {
      if (
        deps.userType !== 'ant' ||
        deps.apiMetricsRef.current.length === 0
      ) {
        return undefined
      }

      return buildLocalApiMetricsSummary({
        entries: deps.apiMetricsRef.current,
        hookDurationMs: deps.getHookDurationMs(),
        hookCount: deps.getHookCount(),
        toolDurationMs: deps.getToolDurationMs(),
        toolCount: deps.getToolCount(),
        classifierDurationMs: deps.getClassifierDurationMs(),
        classifierCount: deps.getClassifierCount(),
        turnDurationMs: Date.now() - deps.loadingStartTimeMsRef.current,
        configWriteCount: deps.getConfigWriteCount(),
      })
    },
    appendApiMetricsMessage: (summary: LocalApiMetricsSummary) => {
      deps.appendMessage(createApiMetricsMessage(summary))
    },
    onTurnComplete: async () => {
      await deps.onTurnComplete?.(deps.messagesRef.current)
    },
  }
}
