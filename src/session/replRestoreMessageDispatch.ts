import type { ImageBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'

import type { PastedContent } from '../utils/config.js'
import { textForResubmit } from '../utils/messages.js'
import type { Message, UserMessage } from '../types/message.js'
import type { PromptInputMode } from '../types/textInputTypes.js'
import type { SetAppState } from '../utils/messageQueueManager.js'

export type ReplRestoreMessageLogPayload = {
  preRewindMessageCount: number
  postRewindMessageCount: number
  messagesRemoved: number
  rewindToMessageIndex: number
}

export type ReplRestoreMessageDispatchDeps = {
  currentMessages: Message[]
  setMessages: (messages: Message[]) => void
  generateConversationId: () => string
  setConversationId: (value: string) => void
  resetMicrocompactState: () => void
  resetContextCollapse?: () => void
  setAppState: SetAppState
  setInputValue: (value: string) => void
  setInputMode: (value: PromptInputMode) => void
  setPastedContents: (value: Record<number, PastedContent>) => void
  logRewind: (payload: ReplRestoreMessageLogPayload) => void
}

export function dispatchReplRestoreMessageSync(
  message: UserMessage,
  {
    currentMessages,
    setMessages,
    generateConversationId,
    setConversationId,
    resetMicrocompactState,
    resetContextCollapse,
    setAppState,
    setInputValue,
    setInputMode,
    setPastedContents,
    logRewind,
  }: ReplRestoreMessageDispatchDeps,
): boolean {
  const messageIndex = currentMessages.lastIndexOf(message)
  if (messageIndex === -1) {
    return false
  }

  logRewind({
    preRewindMessageCount: currentMessages.length,
    postRewindMessageCount: messageIndex,
    messagesRemoved: currentMessages.length - messageIndex,
    rewindToMessageIndex: messageIndex,
  })
  setMessages(currentMessages.slice(0, messageIndex))
  setConversationId(generateConversationId())
  resetMicrocompactState()
  resetContextCollapse?.()

  setAppState(prev => ({
    ...prev,
    toolPermissionContext:
      message.permissionMode &&
      prev.toolPermissionContext.mode !== message.permissionMode
        ? {
            ...prev.toolPermissionContext,
            mode: message.permissionMode,
          }
        : prev.toolPermissionContext,
    promptSuggestion: {
      text: null,
      promptId: null,
      shownAt: 0,
      acceptedAt: 0,
      generationRequestId: null,
    },
  }))

  const restored = textForResubmit(message)
  if (restored) {
    setInputValue(restored.text)
    setInputMode(restored.mode)
  }

  if (
    Array.isArray(message.message.content) &&
    message.message.content.some(block => block.type === 'image')
  ) {
    const imageBlocks: Array<ImageBlockParam> = message.message.content.filter(
      block => block.type === 'image',
    )
    if (imageBlocks.length > 0) {
      const newPastedContents: Record<number, PastedContent> = {}
      imageBlocks.forEach((block, index) => {
        if (block.source.type === 'base64') {
          const id = message.imagePasteIds?.[index] ?? index + 1
          newPastedContents[id] = {
            id,
            type: 'image',
            content: block.source.data,
            mediaType: block.source.media_type,
          }
        }
      })
      setPastedContents(newPastedContents)
    }
  }

  return true
}
