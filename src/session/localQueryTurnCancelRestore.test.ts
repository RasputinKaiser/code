import { describe, expect, it } from 'bun:test'
import { resolveCanceledTurnRestoreMessage } from './localQueryTurnCancelRestore.js'

function createUserMessage(
  uuid: string,
  content: string,
  options?: { isMeta?: boolean; toolUseResult?: unknown },
) {
  return {
    type: 'user',
    uuid,
    isMeta: options?.isMeta ?? false,
    toolUseResult: options?.toolUseResult,
    message: {
      content,
    },
  } as never
}

function createAssistantMessage(uuid: string) {
  return {
    type: 'assistant',
    uuid,
    message: {
      id: `assistant-${uuid}`,
      content: [],
    },
  } as never
}

describe('resolveCanceledTurnRestoreMessage', () => {
  it('restores the last selectable user message only for an idle user-cancel turn followed by synthetic messages', () => {
    const firstUser = createUserMessage('u1', 'older prompt')
    const restorableUser = createUserMessage('u2', 'restore me')
    const messages = [
      firstUser,
      createAssistantMessage('a1'),
      restorableUser,
      createAssistantMessage('synthetic'),
    ]

    const restored = resolveCanceledTurnRestoreMessage({
      abortReason: 'user-cancel',
      isQueryActive: false,
      inputValue: '',
      commandQueueLength: 0,
      viewingAgentTaskId: null,
      messages,
      isSelectableUserMessage: message =>
        message.type === 'user' &&
        !message.isMeta &&
        message.toolUseResult === undefined,
      messagesAfterAreOnlySynthetic: (_messages, index) => index === 2,
    })

    expect(restored).toBe(restorableUser)
  })

  it('refuses to restore when the latest selectable user message is followed by non-synthetic output', () => {
    const restorableUser = createUserMessage('u1', 'restore me')
    const messages = [restorableUser, createAssistantMessage('a1')]

    const restored = resolveCanceledTurnRestoreMessage({
      abortReason: 'user-cancel',
      isQueryActive: false,
      inputValue: '',
      commandQueueLength: 0,
      viewingAgentTaskId: null,
      messages,
      isSelectableUserMessage: message =>
        message.type === 'user' &&
        !message.isMeta &&
        message.toolUseResult === undefined,
      messagesAfterAreOnlySynthetic: () => false,
    })

    expect(restored).toBeUndefined()
  })

  it('refuses to restore when cancel preconditions are not met', () => {
    const restorableUser = createUserMessage('u1', 'restore me')

    expect(
      resolveCanceledTurnRestoreMessage({
        abortReason: 'timeout',
        isQueryActive: false,
        inputValue: '',
        commandQueueLength: 0,
        viewingAgentTaskId: null,
        messages: [restorableUser],
        isSelectableUserMessage: message => message.type === 'user',
        messagesAfterAreOnlySynthetic: () => true,
      }),
    ).toBeUndefined()

    expect(
      resolveCanceledTurnRestoreMessage({
        abortReason: 'user-cancel',
        isQueryActive: false,
        inputValue: 'draft still present',
        commandQueueLength: 0,
        viewingAgentTaskId: null,
        messages: [restorableUser],
        isSelectableUserMessage: message => message.type === 'user',
        messagesAfterAreOnlySynthetic: () => true,
      }),
    ).toBeUndefined()
  })
})
