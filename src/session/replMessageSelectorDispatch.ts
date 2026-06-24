import type { Dispatch, SetStateAction } from 'react'
import type {
  Message as MessageType,
  PartialCompactDirection,
  UserMessage,
} from '../types/message.js'
import type { ProcessUserInputContext } from '../utils/processUserInput/processUserInput.js'
import { buildReplPromptContext } from './replPromptContextBuilder.js'

type ReplPartialCompactResult = {
  boundaryMarker: MessageType
  summaryMessages: MessageType[]
  attachments: MessageType[]
  hookResults: MessageType[]
  messagesToKeep?: MessageType[]
}

export type ReplMessageSelectorSummarizeDispatchDeps = {
  messages: MessageType[]
  getMessagesAfterCompactBoundary: (messages: MessageType[]) => MessageType[]
  appendActiveContextWarning: () => void
  createAbortController: () => AbortController
  buildToolUseContext: (
    compactMessages: MessageType[],
    abortController: AbortController,
  ) => ProcessUserInputContext
  buildRenderedSystemPrompt: (
    context: ProcessUserInputContext,
  ) => Promise<string>
  getUserContext: () => Promise<Record<string, string>>
  getSystemContext: () => Promise<Record<string, string>>
  partialCompactConversation: (
    compactMessages: MessageType[],
    messageIndex: number,
    context: ProcessUserInputContext,
    compactContext: {
      systemPrompt: string
      userContext: Record<string, string>
      systemContext: Record<string, string>
      toolUseContext: ProcessUserInputContext
      forkContextMessages: MessageType[]
    },
    feedback?: string,
    direction?: PartialCompactDirection,
  ) => Promise<ReplPartialCompactResult>
  isFullscreenEnvEnabled: () => boolean
  setMessages: Dispatch<SetStateAction<MessageType[]>>
  clearContextBlockedIfNeeded: () => void
  setConversationId: (id: string) => void
  generateConversationId: () => string
  onTranscriptReset?: () => void
  runPostCompactCleanup: (
    querySource: ProcessUserInputContext['options']['querySource'],
  ) => void
  textForResubmit: (
    message: UserMessage,
  ) => { text: string; mode: 'bash' | 'prompt' } | null
  setInputValue: (value: string) => void
  setInputMode: (mode: 'bash' | 'prompt') => void
  getHistoryShortcut: () => string
  addNotification: (params: {
    key: string
    text: string
    priority: 'medium'
    timeoutMs: number
  }) => void
}

export async function dispatchReplMessageSelectorSummarize(
  message: UserMessage,
  feedback: string | undefined,
  direction: PartialCompactDirection,
  deps: ReplMessageSelectorSummarizeDispatchDeps,
): Promise<void> {
  const compactMessages = deps.getMessagesAfterCompactBoundary(deps.messages)
  const messageIndex = compactMessages.indexOf(message)
  if (messageIndex === -1) {
    deps.appendActiveContextWarning()
    return
  }

  const abortController = deps.createAbortController()
  const context = deps.buildToolUseContext(compactMessages, abortController)
  const { systemPrompt, userContext, systemContext } =
    await buildReplPromptContext(context, {
      buildRenderedSystemPrompt: deps.buildRenderedSystemPrompt,
      getUserContext: deps.getUserContext,
      getSystemContext: deps.getSystemContext,
    })

  const result = await deps.partialCompactConversation(
    compactMessages,
    messageIndex,
    context,
    {
      systemPrompt,
      userContext,
      systemContext,
      toolUseContext: context,
      forkContextMessages: compactMessages,
    },
    feedback,
    direction,
  )

  const kept = result.messagesToKeep ?? []
  const ordered =
    direction === 'up_to'
      ? [...result.summaryMessages, ...kept]
      : [...kept, ...result.summaryMessages]
  const postCompact = [
    result.boundaryMarker,
    ...ordered,
    ...result.attachments,
    ...result.hookResults,
  ]

  if (deps.isFullscreenEnvEnabled() && direction === 'from') {
    deps.setMessages(old => {
      const rawIdx = old.findIndex(m => m.uuid === message.uuid)
      return [...old.slice(0, rawIdx === -1 ? 0 : rawIdx), ...postCompact]
    })
  } else {
    deps.setMessages(postCompact)
  }

  deps.clearContextBlockedIfNeeded()
  deps.setConversationId(deps.generateConversationId())
  deps.onTranscriptReset?.()
  deps.runPostCompactCleanup(context.options.querySource)

  if (direction === 'from') {
    const restored = deps.textForResubmit(message)
    if (restored) {
      deps.setInputValue(restored.text)
      deps.setInputMode(restored.mode)
    }
  }

  deps.addNotification({
    key: 'summarize-ctrl-o-hint',
    text: `Conversation summarized (${deps.getHistoryShortcut()} for history)`,
    priority: 'medium',
    timeoutMs: 8000,
  })
}
