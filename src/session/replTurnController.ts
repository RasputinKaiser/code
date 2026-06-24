import { feature } from 'bun:bundle'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { logEvent } from 'src/services/analytics/index.js'
import type { QueryGuard } from '../utils/QueryGuard.js'
import { parseTokenBudget } from '../utils/tokenBudget.js'
import {
  getCurrentTurnTokenBudget,
  snapshotOutputTokensForTurn,
} from '../bootstrap/state.js'
import {
  createAssistantAPIErrorMessage,
  getContentText,
} from '../utils/messages.js'
import { isAgentSwarmsEnabled } from '../utils/agentSwarmsEnabled.js'
import { getAgentName, getTeamName } from '../utils/teammate.js'
import { setMemberActive } from '../utils/swarm/teamHelpers.js'
import type { UserMessage } from '../types/message.js'
import type { Message } from '../types/message.js'
import type { EffortValue } from '../utils/effort.js'
import { errorMessage } from '../utils/errors.js'
import { logError } from '../utils/log.js'

export type ReplOnQueryFn = (
  newMessages: Message[],
  abortController: AbortController,
  shouldQuery: boolean,
  additionalAllowedTools: string[],
  mainLoopModel: string,
  onBeforeQueryCallback?: (
    input: string,
    newMessages: Message[],
  ) => Promise<boolean>,
  input?: string,
  effort?: EffortValue,
) => Promise<void>

export type ReplOnQueryDeps = {
  queryGuard: Pick<QueryGuard, 'tryStart' | 'end' | 'isActive'>
  enqueuePrompt: (value: string) => void
  setMessages: Dispatch<SetStateAction<Message[]>>
  messagesRef: MutableRefObject<Message[]>
  responseLengthRef: MutableRefObject<number>
  apiMetricsRef: MutableRefObject<unknown[]>
  setStreamingToolUses: (value: unknown[]) => void
  setStreamingText: (value: string | null) => void
  resetTimingRefs: () => void
  mrOnBeforeQuery: (
    input: string,
    latestMessages: Message[],
    newMessagesLength: number,
  ) => Promise<void>
  runQueryImpl: (
    messagesIncludingNewMessages: Message[],
    newMessages: Message[],
    abortController: AbortController,
    shouldQuery: boolean,
    additionalAllowedTools: string[],
    mainLoopModel: string,
    effort?: EffortValue,
  ) => Promise<void>
  finalizeCurrentTurn: (abortController: AbortController) => Promise<void>
  getRestorableCanceledMessage: (
    abortController: AbortController,
  ) => UserMessage | undefined
  removeLastFromHistory: () => void
  restoreMessageSync: (message: UserMessage) => void
}

export function createReplOnQuery(deps: ReplOnQueryDeps): ReplOnQueryFn {
  return async function onQuery(
    newMessages,
    abortController,
    shouldQuery,
    additionalAllowedTools,
    mainLoopModel,
    onBeforeQueryCallback,
    input,
    effort,
  ): Promise<void> {
    if (isAgentSwarmsEnabled()) {
      const teamName = getTeamName()
      const agentName = getAgentName()
      if (teamName && agentName) {
        void setMemberActive(teamName, agentName, true)
      }
    }

    const thisGeneration = deps.queryGuard.tryStart()
    if (thisGeneration === null) {
      logEvent('ncode_concurrent_onquery_detected', {})

      newMessages
        .filter((message): message is UserMessage => {
          return message.type === 'user' && !message.isMeta
        })
        .map(message => getContentText(message.message.content))
        .filter((message): message is string => message !== null)
        .forEach((message, index) => {
          deps.enqueuePrompt(message)
          if (index === 0) {
            logEvent('ncode_concurrent_onquery_enqueued', {})
          }
        })
      return
    }

    let caughtError: unknown
    try {
      deps.resetTimingRefs()
      deps.setMessages(oldMessages => [...oldMessages, ...newMessages])
      deps.responseLengthRef.current = 0
      if (feature('TOKEN_BUDGET')) {
        const parsedBudget = input ? parseTokenBudget(input) : null
        snapshotOutputTokensForTurn(
          parsedBudget ?? getCurrentTurnTokenBudget(),
        )
      }
      deps.apiMetricsRef.current = []
      deps.setStreamingToolUses([])
      deps.setStreamingText(null)

      const latestMessages = deps.messagesRef.current
      if (input) {
        await deps.mrOnBeforeQuery(input, latestMessages, newMessages.length)
      }

      if (onBeforeQueryCallback && input) {
        const shouldProceed = await onBeforeQueryCallback(input, latestMessages)
        if (!shouldProceed) {
          return
        }
      }

      await deps.runQueryImpl(
        latestMessages,
        newMessages,
        abortController,
        shouldQuery,
        additionalAllowedTools,
        mainLoopModel,
        effort,
      )
    } catch (error) {
      caughtError = error
      logError(error)
      logEvent('ncode_repl_query_unhandled_error', {})
      deps.setMessages(oldMessages => [
        ...oldMessages,
        createAssistantAPIErrorMessage({
          content: `NCode internal error: ${errorMessage(error)}`,
        }),
      ])
    } finally {
      if (deps.queryGuard.end(thisGeneration)) {
        await deps.finalizeCurrentTurn(abortController)
      }

      const restorableUserMessage =
        deps.getRestorableCanceledMessage(abortController)
      if (restorableUserMessage) {
        deps.removeLastFromHistory()
        deps.restoreMessageSync(restorableUserMessage)
      }
    }

    if (caughtError) {
      return
    }
  }
}
