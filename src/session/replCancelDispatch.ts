import type { Message } from '../types/message.js'
import { createAssistantMessage } from '../utils/messages.js'
import type { ReplFocusedInputDialog } from './replFocusedInputDialog.js'

export type ReplCancelPromptQueueItem = {
  reject: (reason: Error) => void
}

export function dispatchReplCancel(
  state: {
    focusedInputDialog: ReplFocusedInputDialog | undefined
    streamMode: string | undefined
    streamingText: string | null
    promptQueue: ReplCancelPromptQueueItem[]
    proactiveEnabled: boolean
    tokenBudgetEnabled: boolean
    isRemoteMode: boolean
  },
  deps: {
    logDebug: (message: string) => void
    pauseProactive: () => void
    forceEndQueryGuard: () => void
    markSkipIdleCheckFalse: () => void
    setMessages: (updater: (prev: Message[]) => Message[]) => void
    resetLoadingState: () => void
    clearTokenBudgetSnapshot: () => void
    abortToolUseConfirmRequest: () => void
    clearToolUseConfirmQueue: () => void
    clearPromptQueue: () => void
    abortController: AbortController | null
    cancelRemoteRequest: () => void
    setAbortController: (controller: AbortController | null) => void
    getCurrentMessages: () => Message[]
    completeTurnAsAborted: (messages: Message[]) => void
  },
): void {
  if (state.focusedInputDialog === 'elicitation') {
    return
  }

  deps.logDebug(
    `[onCancel] focusedInputDialog=${state.focusedInputDialog} streamMode=${state.streamMode}`,
  )

  if (state.proactiveEnabled) {
    deps.pauseProactive()
  }
  deps.forceEndQueryGuard()
  deps.markSkipIdleCheckFalse()

  if (state.streamingText?.trim()) {
    deps.setMessages(prev => [
      ...prev,
      createAssistantMessage({
        content: state.streamingText,
      }),
    ])
  }
  deps.resetLoadingState()

  if (state.tokenBudgetEnabled) {
    deps.clearTokenBudgetSnapshot()
  }

  if (state.focusedInputDialog === 'tool-permission') {
    deps.abortToolUseConfirmRequest()
    deps.clearToolUseConfirmQueue()
  } else if (state.focusedInputDialog === 'prompt') {
    for (const item of state.promptQueue) {
      item.reject(new Error('Prompt cancelled by user'))
    }
    deps.clearPromptQueue()
    deps.abortController?.abort('user-cancel')
  } else if (state.isRemoteMode) {
    deps.cancelRemoteRequest()
  } else {
    deps.abortController?.abort('user-cancel')
  }

  deps.setAbortController(null)
  deps.completeTurnAsAborted(deps.getCurrentMessages())
}
