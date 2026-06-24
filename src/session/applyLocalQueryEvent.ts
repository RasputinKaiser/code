import { randomUUID } from 'crypto'

import type { SpinnerMode } from '../components/Spinner/types.js'
import * as React from 'react'
import type { Message } from '../types/message.js'
import {
  type RequestStartEvent,
  type StreamEvent,
  type TombstoneMessage,
  type ToolUseSummaryMessage,
} from '../types/message.js'
import { isEphemeralToolProgress } from './isEphemeralToolProgress.js'
import {
  getMessagesAfterCompactBoundary,
  handleMessageFromStream,
  isCompactBoundaryMessage,
  type StreamingThinking,
  type StreamingToolUse,
} from '../utils/messages.js'

type SetStateAction<T> = T | ((prev: T) => T)
type StateSetter<T> = (action: SetStateAction<T>) => void

export type LocalQueryEvent =
  | StreamEvent
  | RequestStartEvent
  | Message
  | TombstoneMessage
  | ToolUseSummaryMessage

type HandleMessageFromStreamFn = (
  event: LocalQueryEvent,
  onNewMessage: (newMessage: Message) => void,
  onNewContent: (newContent: string) => void,
  setStreamMode: StateSetter<SpinnerMode>,
  setStreamingToolUses: StateSetter<StreamingToolUse[]>,
  onTombstone: (tombstonedMessage: Message) => void,
  setStreamingThinking?: StateSetter<StreamingThinking | null>,
  onApiMetrics?: (metrics: { ttftMs: number }) => void,
  onStreamingText?: (f: (current: string | null) => string | null) => void,
) => void

type IsCompactBoundaryMessageFn = (message: Message) => boolean
type GetMessagesAfterCompactBoundaryFn = (
  messages: Message[],
  options: { includeSnipped: boolean },
) => Message[]

export type LocalStreamMessageAdapter = {
  handleMessageFromStream: HandleMessageFromStreamFn
  isCompactBoundaryMessage: IsCompactBoundaryMessageFn
  getMessagesAfterCompactBoundary: GetMessagesAfterCompactBoundaryFn
}

export type ApplyLocalQueryEventDeps = {
  setMessages: StateSetter<Message[]>
  setConversationId: (id: string) => void
  createConversationId?: () => string
  setResponseLength: (f: (current: number) => number) => void
  setStreamMode: StateSetter<SpinnerMode>
  setStreamingToolUses: StateSetter<StreamingToolUse[]>
  setStreamingThinking?: StateSetter<StreamingThinking | null>
  onStreamingText?: (f: (current: string | null) => string | null) => void
  removeTranscriptMessage: (uuid: string) => void | Promise<void>
  onApiMetrics?: (metrics: { ttftMs: number }) => void
  setContextBlocked?: (blocked: boolean) => void
  onCompactBoundary?: () => void
  isFullscreen: boolean
  streamAdapter?: LocalStreamMessageAdapter
}

const defaultStreamAdapter: LocalStreamMessageAdapter = {
  handleMessageFromStream,
  isCompactBoundaryMessage,
  getMessagesAfterCompactBoundary,
}

export function applyLocalQueryEvent(
  event: LocalQueryEvent,
  deps: ApplyLocalQueryEventDeps,
): void {
  const {
    setMessages,
    setConversationId,
    createConversationId = randomUUID,
    setResponseLength,
    setStreamMode,
    setStreamingToolUses,
    setStreamingThinking,
    onStreamingText,
    removeTranscriptMessage,
    onApiMetrics,
    setContextBlocked,
    onCompactBoundary,
    isFullscreen,
    streamAdapter = defaultStreamAdapter,
  } = deps

  streamAdapter.handleMessageFromStream(
    event,
    newMessage => {
      if (streamAdapter.isCompactBoundaryMessage(newMessage)) {
        onCompactBoundary?.()
        if (isFullscreen) {
          setMessages(old => [
            ...streamAdapter.getMessagesAfterCompactBoundary(old, {
              includeSnipped: true,
            }),
            newMessage,
          ])
        } else {
          setMessages(() => [newMessage])
        }
        setConversationId(createConversationId())
        setContextBlocked?.(false)
      } else if (
        newMessage.type === 'progress' &&
        isEphemeralToolProgress(newMessage.data.type)
      ) {
        setMessages(oldMessages => {
          const last = oldMessages.at(-1)
          if (
            last?.type === 'progress' &&
            last.parentToolUseID === newMessage.parentToolUseID &&
            last.data.type === newMessage.data.type
          ) {
            const copy = oldMessages.slice()
            copy[copy.length - 1] = newMessage
            return copy
          }
          return [...oldMessages, newMessage]
        })
      } else {
        setMessages(oldMessages => [...oldMessages, newMessage])
      }

      if (newMessage.type === 'assistant' && 'isApiErrorMessage' in newMessage) {
        setContextBlocked?.(Boolean(newMessage.isApiErrorMessage))
      } else if (newMessage.type === 'assistant') {
        setContextBlocked?.(false)
      }
    },
    newContent => {
      setResponseLength(length => length + newContent.length)
    },
    setStreamMode,
    setStreamingToolUses,
    tombstonedMessage => {
      setMessages(oldMessages => oldMessages.filter(m => m !== tombstonedMessage))
      void removeTranscriptMessage(tombstonedMessage.uuid)
    },
    setStreamingThinking,
    onApiMetrics,
    onStreamingText,
  )
}
