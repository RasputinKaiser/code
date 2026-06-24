import { describe, expect, test } from 'bun:test'

import { getDefaultAppState } from '../state/AppState.js'
import { createUserMessage } from '../utils/messages.js'
import { createReplMessageSelectorRestoreHandlers } from './replMessageSelectorHandlers.js'

const createHandlerDeps = () => {
  const message = {
    ...createUserMessage({
      content: [
        { type: 'text', text: 'restore me' },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: 'abc123',
          },
        },
      ],
    }),
    permissionMode: 'acceptEdits',
    imagePasteIds: [42],
  }
  const laterMessage = createUserMessage({ content: 'later message' })
  let nextState = getDefaultAppState()
  const events: string[] = []

  const handler = createReplMessageSelectorRestoreHandlers({
    getCurrentMessages: () => [message, laterMessage],
    setMessages: () => {
      events.push('messages')
    },
    generateConversationId: () => 'new-session-id',
    setConversationId: value => {
      events.push(`session:${value}`)
    },
    resetMicrocompactState: () => {
      events.push('microcompact')
    },
    resetContextCollapse: () => {
      events.push('context-collapse')
    },
    setAppState: updater => {
      events.push('app-state')
      nextState = updater(nextState)
    },
    setInputValue: value => {
      events.push(`input:${value}`)
    },
    setInputMode: value => {
      events.push(`mode:${value}`)
    },
    setPastedContents: () => {
      events.push('pastes')
    },
    logEvent: (event, payload) => {
      events.push(`${event}:${payload.preRewindMessageCount}:${payload.postRewindMessageCount}:${payload.messagesRemoved}:${payload.rewindToMessageIndex}`)
    },
  })

  return { message, events, handler, nextStateRef: () => nextState }
}

describe('createReplMessageSelectorRestoreHandlers', () => {
  test('restores and emits a rewind log event', () => {
    const { message, events, handler, nextStateRef } = createHandlerDeps()
    const restored = handler.restoreMessageSync(message)

    expect(restored).toBe(true)
    expect(events).toContain('ncode_conversation_rewind:2:0:2:0')
    expect(nextStateRef().toolPermissionContext.mode).toBe('acceptEdits')
  })
})
