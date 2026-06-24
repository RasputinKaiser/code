import { describe, expect, it } from 'bun:test'

import {
  applyLocalQueryEvent,
  type ApplyLocalQueryEventDeps,
  type LocalQueryEvent,
  type LocalStreamMessageAdapter,
} from './applyLocalQueryEvent.js'

type SetStateAction<T> = T | ((prev: T) => T)

function createState<T>(initial: T): {
  get: () => T
  set: (action: SetStateAction<T>) => void
} {
  let value = initial
  return {
    get: () => value,
    set: action => {
      value =
        typeof action === 'function'
          ? (action as (prev: T) => T)(value)
          : action
    },
  }
}

function createDeps(options?: {
  messages?: unknown[]
  conversationId?: string
  createConversationId?: () => string
  isFullscreen?: boolean
  onCompactBoundary?: () => void
}): {
  deps: ApplyLocalQueryEventDeps
  getMessages: () => unknown[]
  getConversationId: () => string
  setConversationIdCalls: string[]
  removeTranscriptCalls: string[]
} {
  const messagesState = createState<unknown[]>(options?.messages ?? [])
  const streamModeState = createState<any>('idle')
  const streamingToolUsesState = createState<any[]>([])

  let conversationId = options?.conversationId ?? 'conversation-0'
  const setConversationIdCalls: string[] = []
  const removeTranscriptCalls: string[] = []
  let responseLength = 0

  const deps: ApplyLocalQueryEventDeps = {
    setMessages: messagesState.set,
    setConversationId: id => {
      conversationId = id
      setConversationIdCalls.push(id)
    },
    createConversationId: options?.createConversationId,
    setResponseLength: updater => {
      responseLength = updater(responseLength)
    },
    setStreamMode: streamModeState.set,
    setStreamingToolUses: streamingToolUsesState.set,
    removeTranscriptMessage: uuid => {
      removeTranscriptCalls.push(uuid)
    },
    onCompactBoundary: options?.onCompactBoundary,
    isFullscreen: options?.isFullscreen ?? false,
    streamAdapter: createTestStreamAdapter(),
  }

  return {
    deps,
    getMessages: messagesState.get,
    getConversationId: () => conversationId,
    setConversationIdCalls,
    removeTranscriptCalls,
  }
}

function createTestStreamAdapter(): LocalStreamMessageAdapter {
  return {
    handleMessageFromStream: (
      event,
      onNewMessage,
      _onNewContent,
      _setStreamMode,
      _setStreamingToolUses,
      onTombstone,
    ) => {
      if (event.type === 'tombstone') {
        onTombstone(event.message as any)
        return
      }
      onNewMessage(event as any)
    },
    isCompactBoundaryMessage: message =>
      message.type === 'system' && message.subtype === 'compact_boundary',
    getMessagesAfterCompactBoundary: messages => {
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const msg = messages[i]
        if (msg.type === 'system' && msg.subtype === 'compact_boundary') {
          return messages.slice(i)
        }
      }
      return messages
    },
  }
}

describe('applyLocalQueryEvent', () => {
  it('resets to only compact boundary in non-fullscreen mode and bumps conversation id', () => {
    const initialMessages = [
      { type: 'assistant', uuid: 'assistant-1' },
      { type: 'system', subtype: 'informational', uuid: 'system-1' },
    ]
    const compactBoundary = {
      type: 'system',
      subtype: 'compact_boundary',
      uuid: 'boundary-1',
    } as LocalQueryEvent

    const { deps, getMessages, getConversationId, setConversationIdCalls } =
      createDeps({
        messages: initialMessages,
        conversationId: 'conversation-before',
        createConversationId: () => 'conversation-after',
        isFullscreen: false,
      })

    applyLocalQueryEvent(compactBoundary, deps)

    expect(getMessages()).toEqual([compactBoundary])
    expect(setConversationIdCalls).toEqual(['conversation-after'])
    expect(getConversationId()).toBe('conversation-after')
  })

  it('runs compact-boundary repaint callback before shrinking non-fullscreen messages', () => {
    const events: string[] = []
    const compactBoundary = {
      type: 'system',
      subtype: 'compact_boundary',
      uuid: 'boundary-1',
    } as LocalQueryEvent

    const { deps } = createDeps({
      messages: [{ type: 'assistant', uuid: 'assistant-1' }],
      isFullscreen: false,
      onCompactBoundary: () => {
        events.push('compact-callback')
      },
    })
    const originalSetMessages = deps.setMessages
    deps.setMessages = action => {
      events.push('set-messages')
      originalSetMessages(action)
    }

    applyLocalQueryEvent(compactBoundary, deps)

    expect(events).toEqual(['compact-callback', 'set-messages'])
  })

  it('replaces matching ephemeral progress instead of appending', () => {
    const stable = {
      type: 'assistant',
      uuid: 'assistant-stable',
    }
    const previousProgress = {
      type: 'progress',
      uuid: 'progress-old',
      toolUseID: 'tool-use-1',
      parentToolUseID: 'parent-tool-use',
      timestamp: '2026-04-13T00:00:00.000Z',
      data: {
        type: 'bash_progress',
        summary: 'old',
      },
    }
    const nextProgress = {
      ...previousProgress,
      uuid: 'progress-new',
      data: {
        type: 'bash_progress',
        summary: 'new',
      },
    }

    const { deps, getMessages } = createDeps({
      messages: [stable, previousProgress],
    })

    applyLocalQueryEvent(nextProgress as LocalQueryEvent, deps)

    const messages = getMessages()
    expect(messages).toHaveLength(2)
    expect(messages).toEqual([stable, nextProgress])
  })

  it('removes tombstoned message and calls removeTranscriptMessage', () => {
    const keepBefore = {
      type: 'assistant',
      uuid: 'keep-before',
    }
    const target = {
      type: 'assistant',
      uuid: 'target-message',
    }
    const keepAfter = {
      type: 'assistant',
      uuid: 'keep-after',
    }

    const tombstoneEvent = {
      type: 'tombstone',
      message: target,
    } as LocalQueryEvent

    const { deps, getMessages, removeTranscriptCalls } = createDeps({
      messages: [keepBefore, target, keepAfter],
    })

    applyLocalQueryEvent(tombstoneEvent, deps)

    expect(getMessages()).toEqual([keepBefore, keepAfter])
    expect(removeTranscriptCalls).toEqual(['target-message'])
  })

  it('uses the default stream adapter for streamed text events', () => {
    const streamModeState = createState<any>('idle')
    const streamingToolUsesState = createState<any[]>([])
    const streamingTextState = createState<string | null>(null)
    let responseLength = 0

    const deps: ApplyLocalQueryEventDeps = {
      setMessages: () => {},
      setConversationId: () => {},
      setResponseLength: updater => {
        responseLength = updater(responseLength)
      },
      setStreamMode: streamModeState.set,
      setStreamingToolUses: streamingToolUsesState.set,
      onStreamingText: updater => {
        streamingTextState.set(updater)
      },
      removeTranscriptMessage: () => {},
      isFullscreen: false,
    }

    applyLocalQueryEvent(
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'text_delta',
            text: 'hi',
          },
        },
      } as LocalQueryEvent,
      deps,
    )

    expect(responseLength).toBe(2)
    expect(streamingTextState.get()).toBe('hi')
    expect(streamModeState.get()).toBe('idle')
    expect(streamingToolUsesState.get()).toEqual([])
  })

  it('completes streaming with a single atomic state transition when setMessages clears streamingText', () => {
    type Snapshot = {
      messages: unknown[]
      streamingText: string | null
    }

    const history: Snapshot[] = []
    let state: Snapshot = { messages: [], streamingText: null }

    const setMessages = (action: SetStateAction<unknown[]>) => {
      const nextMessages =
        typeof action === 'function'
          ? (action as (prev: unknown[]) => unknown[])(state.messages)
          : action

      const messagesChanged = nextMessages !== state.messages
      const nextStreamingText =
        messagesChanged && state.streamingText !== null ? null : state.streamingText

      state = {
        messages: nextMessages,
        streamingText: nextStreamingText,
      }
      history.push({ ...state })
    }

    const onStreamingText = (f: (current: string | null) => string | null) => {
      const next = f(state.streamingText)
      if (next !== state.streamingText) {
        state = { ...state, streamingText: next }
        history.push({ ...state })
      }
    }

    const deps: ApplyLocalQueryEventDeps = {
      setMessages,
      setConversationId: () => {},
      setResponseLength: () => {},
      setStreamMode: () => {},
      setStreamingToolUses: () => {},
      onStreamingText,
      removeTranscriptMessage: () => {},
      isFullscreen: false,
    }

    // Simulate streaming text deltas
    applyLocalQueryEvent(
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Hello' },
        },
      } as LocalQueryEvent,
      deps,
    )
    applyLocalQueryEvent(
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: ' world' },
        },
      } as LocalQueryEvent,
      deps,
    )

    // Simulate the final assistant message completing the stream
    const assistantMessage = {
      type: 'assistant',
      uuid: 'assistant-1',
      message: {
        content: [{ type: 'text', text: 'Hello world' }],
        role: 'assistant',
      },
    } as any as LocalQueryEvent

    applyLocalQueryEvent(assistantMessage, deps)

    // Assert on the state history — verify there is no frame that shows both
    // a non-empty messages array and a non-null streamingText.
    const duplicateFrames = history.filter(
      snap => snap.messages.length > 0 && snap.streamingText !== null,
    )

    expect(duplicateFrames).toEqual([])

    // Also verify the final state is correct
    expect(state.messages).toHaveLength(1)
    expect(state.streamingText).toBeNull()
  })
})
