import { describe, expect, test } from 'bun:test'

import { getDefaultAppState } from '../state/AppState.js'
import { createUserMessage } from '../utils/messages.js'
import { dispatchReplRestoreMessageSync } from './replRestoreMessageDispatch.js'

describe('dispatchReplRestoreMessageSync', () => {
  test('preserves rewind ordering, prompt reset, and pasted image restore semantics', () => {
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
      permissionMode: 'acceptEdits' as const,
      imagePasteIds: [42],
    }
    const laterMessage = createUserMessage({
      content: 'later message',
    })
    const events: string[] = []
    let nextState = getDefaultAppState()

    const handled = dispatchReplRestoreMessageSync(message, {
      currentMessages: [message, laterMessage],
      setMessages: messages => {
        events.push(`messages:${messages.length}`)
        expect(messages).toEqual([])
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
      setPastedContents: value => {
        events.push(`pastes:${Object.keys(value).join(',')}`)
        expect(value).toEqual({
          42: {
            id: 42,
            type: 'image',
            content: 'abc123',
            mediaType: 'image/png',
          },
        })
      },
      logRewind: payload => {
        events.push(
          `rewind:${payload.preRewindMessageCount}:${payload.postRewindMessageCount}:${payload.messagesRemoved}:${payload.rewindToMessageIndex}`,
        )
      },
    })

    expect(handled).toBe(true)
    expect(events).toEqual([
      'rewind:2:0:2:0',
      'messages:0',
      'session:new-session-id',
      'microcompact',
      'context-collapse',
      'app-state',
      'input:restore me',
      'mode:prompt',
      'pastes:42',
    ])
    expect(nextState.toolPermissionContext.mode).toBe('acceptEdits')
    expect(nextState.promptSuggestion).toEqual({
      text: null,
      promptId: null,
      shownAt: 0,
      acceptedAt: 0,
      generationRequestId: null,
    })
  })

  test('no-ops when the target message is not in the current transcript', () => {
    const message = createUserMessage({
      content: 'restore me',
    })
    const events: string[] = []

    const handled = dispatchReplRestoreMessageSync(message, {
      currentMessages: [],
      setMessages: () => {
        events.push('messages')
      },
      generateConversationId: () => 'new-session-id',
      setConversationId: () => {
        events.push('session')
      },
      resetMicrocompactState: () => {
        events.push('microcompact')
      },
      setAppState: () => {
        events.push('app-state')
      },
      setInputValue: () => {
        events.push('input')
      },
      setInputMode: () => {
        events.push('mode')
      },
      setPastedContents: () => {
        events.push('pastes')
      },
      logRewind: () => {
        events.push('rewind')
      },
    })

    expect(handled).toBe(false)
    expect(events).toEqual([])
  })
})
