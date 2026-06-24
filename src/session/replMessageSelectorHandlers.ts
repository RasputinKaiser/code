import type { Message as MessageType, UserMessage } from '../types/message.js'
import {
  dispatchReplRestoreMessageSync,
  type ReplRestoreMessageDispatchDeps,
  type ReplRestoreMessageLogPayload,
} from './replRestoreMessageDispatch.js'

type DispatchDepsWithoutCurrentMessages = Omit<
  ReplRestoreMessageDispatchDeps,
  'currentMessages' | 'logRewind'
>

export type ReplMessageSelectorRestoreHandlersDeps = DispatchDepsWithoutCurrentMessages & {
  getCurrentMessages: () => MessageType[]
  logEvent: (event: string, payload: ReplRestoreMessageLogPayload) => void
}

export function createReplMessageSelectorRestoreHandlers(
  deps: ReplMessageSelectorRestoreHandlersDeps,
) {
  const { getCurrentMessages, logEvent, ...dispatchDeps } = deps

  const restoreMessageSync = (message: UserMessage) =>
    dispatchReplRestoreMessageSync(message, {
      ...dispatchDeps,
      currentMessages: getCurrentMessages(),
      logRewind: payload => logEvent('ncode_conversation_rewind', payload),
    })

  const handleRestoreMessage = (message: UserMessage) => {
    setImmediate(
      (restore: (message: UserMessage) => boolean, queued: UserMessage) => {
        restore(queued)
      },
      restoreMessageSync,
      message,
    )
  }

  return {
    handleRestoreMessage,
    restoreMessageSync,
  }
}
