import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

import type { AppState } from '../state/AppState.js'
import type { Message, UserMessage } from '../types/message.js'
import { count } from '../utils/array.js'
import { createTurnDurationMessage } from '../utils/messages.js'
import { isLoggableMessage } from '../utils/sessionStorage.js'
import type { TurnBudgetInfo } from './localQueryTurnCompletion.js'
import {
  finalizeLocalQueryTurn,
  type FinalizeLocalQueryTurnDeps,
  type FinalizeLocalQueryTurnOptions,
} from './localQueryTurnFinalization.js'
import { resolveCanceledTurnRestoreMessage } from './localQueryTurnCancelRestore.js'

type ReplFinalizeCurrentTurnOptions = FinalizeLocalQueryTurnOptions & {
  abortController: AbortController
}

type ReplFinalizeCurrentTurnDeps = {
  setLastQueryCompletionTime: (value: number) => void
  skipIdleCheckRef: MutableRefObject<boolean>
  resetLoadingState: () => void
  mrOnTurnComplete: (
    messages: Message[],
    wasAborted: boolean,
  ) => void | Promise<void>
  messagesRef: MutableRefObject<Message[]>
  sendBridgeResult: () => void
  setAppState: Dispatch<SetStateAction<AppState>>
  clearTokenBudget: () => void
  swarmStartTimeRef: MutableRefObject<number | null>
  swarmBudgetInfoRef: MutableRefObject<TurnBudgetInfo | undefined>
  setMessages: Dispatch<SetStateAction<Message[]>>
  clearAbortController: () => void
}

type ReplCanceledTurnRestoreDeps = {
  isQueryActive: boolean
  inputValue: string
  commandQueueLength: number
  viewingAgentTaskId: string | null | undefined
  messages: Message[]
  isSelectableUserMessage: (message: Message) => message is UserMessage
  messagesAfterAreOnlySynthetic: (
    messages: Message[],
    index: number,
  ) => boolean
}

type ReplOnQuerySessionInternals = {
  finalizeTurn?: (
    options: FinalizeLocalQueryTurnOptions,
    deps: FinalizeLocalQueryTurnDeps,
  ) => Promise<void>
  resolveCanceledTurnRestoreMessage?: typeof resolveCanceledTurnRestoreMessage
}

export async function dispatchReplFinalizeCurrentTurn(
  {
    abortController,
    ...options
  }: ReplFinalizeCurrentTurnOptions,
  deps: ReplFinalizeCurrentTurnDeps,
  internals: ReplOnQuerySessionInternals = {},
): Promise<void> {
  const finalizeTurn = internals.finalizeTurn ?? finalizeLocalQueryTurn

  await finalizeTurn(options, {
    onBecameIdle: () => {
      deps.setLastQueryCompletionTime(Date.now())
      deps.skipIdleCheckRef.current = false
    },
    resetLoadingState: deps.resetLoadingState,
    onTurnComplete: () =>
      deps.mrOnTurnComplete(
        deps.messagesRef.current,
        abortController.signal.aborted,
      ),
    sendBridgeResult: deps.sendBridgeResult,
    autoHideTungstenPanel: () => {
      if (
        (process.env.NCODE_BUILD_MODE !== 'noumena' &&
          process.env.USER_TYPE !== 'noumena') ||
        abortController.signal.aborted
      ) {
        return
      }

      deps.setAppState(prev => {
        if (prev.tungstenActiveSession === undefined) return prev
        if (prev.tungstenPanelAutoHidden === true) return prev
        return {
          ...prev,
          tungstenPanelAutoHidden: true,
        }
      })
    },
    clearTokenBudget: deps.clearTokenBudget,
    onDeferTurnDuration: (startedAtMs, budgetInfo) => {
      if (deps.swarmStartTimeRef.current === null) {
        deps.swarmStartTimeRef.current = startedAtMs
      }
      if (budgetInfo) {
        deps.swarmBudgetInfoRef.current = budgetInfo
      }
    },
    onAppendTurnDuration: (durationMs, budgetInfo) => {
      deps.setMessages(prev => [
        ...prev,
        createTurnDurationMessage(
          durationMs,
          budgetInfo,
          count(prev, isLoggableMessage),
        ),
      ])
    },
    clearAbortController: deps.clearAbortController,
  })
}

export function resolveReplCanceledTurnRestoreMessage(
  abortController: AbortController,
  deps: ReplCanceledTurnRestoreDeps,
  internals: ReplOnQuerySessionInternals = {},
): UserMessage | undefined {
  const resolveRestoreMessage =
    internals.resolveCanceledTurnRestoreMessage ??
    resolveCanceledTurnRestoreMessage

  return resolveRestoreMessage({
    abortReason: abortController.signal.reason,
    isQueryActive: deps.isQueryActive,
    inputValue: deps.inputValue,
    commandQueueLength: deps.commandQueueLength,
    viewingAgentTaskId: deps.viewingAgentTaskId,
    messages: deps.messages,
    isSelectableUserMessage: deps.isSelectableUserMessage,
    messagesAfterAreOnlySynthetic: deps.messagesAfterAreOnlySynthetic,
  })
}
