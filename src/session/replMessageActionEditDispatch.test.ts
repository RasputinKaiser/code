import { describe, expect, test } from 'bun:test'

import type { Message, UserMessage } from '../types/message.js'
import { dispatchReplMessageActionEdit } from './replMessageActionEditDispatch.js'

function createUserMessage(uuid: string, content: string): UserMessage {
  return {
    type: 'user',
    uuid,
    message: {
      content,
    },
  } as UserMessage
}

function createAssistantMessage(uuid: string): Message {
  return {
    type: 'assistant',
    uuid,
    message: {
      id: `assistant-${uuid}`,
      content: [],
    },
  } as Message
}

describe('dispatchReplMessageActionEdit', () => {
  test('directly restores lossless synthetic tails and preserves cancel-before-restore ordering', async () => {
    const rawUser = createUserMessage('u1', 'restore me')
    const messages: Message[] = [rawUser, createAssistantMessage('a1')]
    const events: string[] = []

    await dispatchReplMessageActionEdit({
      message: rawUser,
      messages,
      fileHistory: {} as never,
      getRawMessageForRenderableUuid: () => rawUser,
      isSelectableUserMessage: (message): message is UserMessage =>
        message.type === 'user',
      fileHistoryHasAnyChanges: async () => false,
      messagesAfterAreOnlySynthetic: (_messages, fromIndex) => fromIndex === 0,
      onCancel: () => {
        events.push('cancel')
      },
      restoreMessage: async message => {
        events.push(`restore:${message.uuid}`)
      },
      setMessageSelectorPreselect: () => {
        events.push('preselect')
      },
      setIsMessageSelectorVisible: () => {
        events.push('show-selector')
      },
    })

    expect(events).toEqual(['cancel', 'restore:u1'])
  })

  test('opens the message selector when the rewind is not lossless', async () => {
    const rawUser = createUserMessage('u1', 'restore me')
    const messages: Message[] = [rawUser, createAssistantMessage('a1')]
    const events: string[] = []

    await dispatchReplMessageActionEdit({
      message: rawUser,
      messages,
      fileHistory: {} as never,
      getRawMessageForRenderableUuid: () => rawUser,
      isSelectableUserMessage: (message): message is UserMessage =>
        message.type === 'user',
      fileHistoryHasAnyChanges: async () => true,
      messagesAfterAreOnlySynthetic: () => true,
      onCancel: () => {
        events.push('cancel')
      },
      restoreMessage: async () => {
        events.push('restore')
      },
      setMessageSelectorPreselect: message => {
        events.push(`preselect:${message?.uuid}`)
      },
      setIsMessageSelectorVisible: visible => {
        events.push(`show-selector:${visible}`)
      },
    })

    expect(events).toEqual(['preselect:u1', 'show-selector:true'])
  })

  test('no-ops when the raw message is missing or not selectable', async () => {
    const renderMessage = createAssistantMessage('rendered')
    const rawAssistant = createAssistantMessage('rendered')
    const events: string[] = []

    await dispatchReplMessageActionEdit({
      message: renderMessage,
      messages: [rawAssistant],
      fileHistory: {} as never,
      getRawMessageForRenderableUuid: () => rawAssistant,
      isSelectableUserMessage: (_message): _message is UserMessage => false,
      fileHistoryHasAnyChanges: async () => false,
      messagesAfterAreOnlySynthetic: () => true,
      onCancel: () => {
        events.push('cancel')
      },
      restoreMessage: async () => {
        events.push('restore')
      },
      setMessageSelectorPreselect: () => {
        events.push('preselect')
      },
      setIsMessageSelectorVisible: () => {
        events.push('show-selector')
      },
    })

    expect(events).toEqual([])
  })
})
