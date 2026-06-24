import type { FileHistoryState } from '../utils/fileHistory.js'
import type { Message, UserMessage } from '../types/message.js'

export type ReplMessageActionEditDispatchDeps = {
  message: Message
  messages: Message[]
  fileHistory: FileHistoryState
  getRawMessageForRenderableUuid: (uuid: string) => Message | undefined
  isSelectableUserMessage: (message: Message) => message is UserMessage
  fileHistoryHasAnyChanges: (
    fileHistory: FileHistoryState,
    messageUuid: string,
  ) => Promise<boolean>
  messagesAfterAreOnlySynthetic: (
    messages: Message[],
    fromIndex: number,
  ) => boolean
  onCancel: () => void
  restoreMessage: (message: UserMessage) => Promise<void> | void
  setMessageSelectorPreselect: (message: UserMessage | undefined) => void
  setIsMessageSelectorVisible: (visible: boolean) => void
}

export async function dispatchReplMessageActionEdit({
  message,
  messages,
  fileHistory,
  getRawMessageForRenderableUuid,
  isSelectableUserMessage,
  fileHistoryHasAnyChanges,
  messagesAfterAreOnlySynthetic,
  onCancel,
  restoreMessage,
  setMessageSelectorPreselect,
  setIsMessageSelectorVisible,
}: ReplMessageActionEditDispatchDeps): Promise<void> {
  const rawMessage = getRawMessageForRenderableUuid(message.uuid)
  if (!rawMessage || !isSelectableUserMessage(rawMessage)) {
    return
  }

  const rawIndex = messages.indexOf(rawMessage)
  if (rawIndex < 0) {
    return
  }

  const noFileChanges = !(await fileHistoryHasAnyChanges(fileHistory, rawMessage.uuid))
  const onlySynthetic = messagesAfterAreOnlySynthetic(messages, rawIndex)

  if (noFileChanges && onlySynthetic) {
    onCancel()
    await restoreMessage(rawMessage)
    return
  }

  setMessageSelectorPreselect(rawMessage)
  setIsMessageSelectorVisible(true)
}
