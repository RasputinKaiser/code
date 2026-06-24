import type { Message, UserMessage } from '../types/message.js'

export type ResolveCanceledTurnRestoreMessageOptions = {
  abortReason: unknown
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

export function resolveCanceledTurnRestoreMessage(
  options: ResolveCanceledTurnRestoreMessageOptions,
): UserMessage | undefined {
  const {
    abortReason,
    isQueryActive,
    inputValue,
    commandQueueLength,
    viewingAgentTaskId,
    messages,
    isSelectableUserMessage,
    messagesAfterAreOnlySynthetic,
  } = options

  if (
    abortReason !== 'user-cancel' ||
    isQueryActive ||
    inputValue !== '' ||
    commandQueueLength !== 0 ||
    viewingAgentTaskId
  ) {
    return undefined
  }

  const lastUserMessage = messages.findLast(isSelectableUserMessage)
  if (!lastUserMessage) {
    return undefined
  }

  const lastUserMessageIndex = messages.lastIndexOf(lastUserMessage)
  if (!messagesAfterAreOnlySynthetic(messages, lastUserMessageIndex)) {
    return undefined
  }

  return lastUserMessage
}
