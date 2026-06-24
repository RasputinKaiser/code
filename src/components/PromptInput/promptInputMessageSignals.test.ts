import { describe, expect, it } from 'bun:test'
import type { Message } from '../../types/message.js'
import { derivePromptInputMessageSignals } from './promptInputMessageSignals.js'

function createUserMessage(uuid: string): Message {
  return {
    type: 'user',
    uuid,
    message: {
      content: 'user prompt',
    },
  } as unknown as Message
}

function createAssistantMessage(
  uuid: string,
  usage?: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  },
): Message {
  return {
    type: 'assistant',
    uuid,
    message: {
      id: `assistant-${uuid}`,
      model: 'claude-test',
      content: [
        {
          type: 'text',
          text: 'assistant reply',
        },
      ],
      ...(usage ? { usage } : {}),
    },
  } as unknown as Message
}

describe('derivePromptInputMessageSignals', () => {
  it('tracks message presence without inventing assistant or usage state', () => {
    expect(derivePromptInputMessageSignals([])).toEqual({
      hasMessages: false,
      hasAssistantMessages: false,
      lastAssistantMessageId: null,
      lastApiUsageKey: 'none',
    })

    expect(derivePromptInputMessageSignals([createUserMessage('u1')])).toEqual({
      hasMessages: true,
      hasAssistantMessages: false,
      lastAssistantMessageId: null,
      lastApiUsageKey: 'none',
    })
  })

  it('keeps the last assistant id stable even before usage arrives', () => {
    expect(
      derivePromptInputMessageSignals([
        createUserMessage('u1'),
        createAssistantMessage('a1'),
      ]),
    ).toEqual({
      hasMessages: true,
      hasAssistantMessages: true,
      lastAssistantMessageId: 'a1',
      lastApiUsageKey: 'none',
    })
  })

  it('changes the usage key only when the latest real API usage changes', () => {
    const beforeUsage = derivePromptInputMessageSignals([
      createUserMessage('u1'),
      createAssistantMessage('a1'),
    ])

    const afterUsage = derivePromptInputMessageSignals([
      createUserMessage('u1'),
      createAssistantMessage('a1', {
        input_tokens: 11,
        output_tokens: 7,
        cache_creation_input_tokens: 3,
        cache_read_input_tokens: 2,
      }),
    ])

    const trailingUser = derivePromptInputMessageSignals([
      createUserMessage('u1'),
      createAssistantMessage('a1', {
        input_tokens: 11,
        output_tokens: 7,
        cache_creation_input_tokens: 3,
        cache_read_input_tokens: 2,
      }),
      createUserMessage('u2'),
    ])

    expect(beforeUsage.lastAssistantMessageId).toBe('a1')
    expect(beforeUsage.lastApiUsageKey).toBe('none')
    expect(afterUsage.lastAssistantMessageId).toBe('a1')
    expect(afterUsage.lastApiUsageKey).toBe('a1:11:7:3:2')
    expect(trailingUser.lastAssistantMessageId).toBe('a1')
    expect(trailingUser.lastApiUsageKey).toBe('a1:11:7:3:2')
  })
})
