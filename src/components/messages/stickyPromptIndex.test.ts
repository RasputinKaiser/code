import { describe, expect, it } from 'bun:test'
import { createAssistantMessage, createUserMessage } from '../../utils/messages.js'
import {
  computeStickyPromptPredecessors,
  stickyPromptText,
} from './stickyPromptIndex.js'

function createQueuedPromptAttachment(prompt: string, commandMode = 'prompt') {
  return {
    type: 'attachment',
    timestamp: Date.now(),
    uuid: 'attachment-uuid',
    attachment: {
      type: 'queued_command',
      prompt,
      commandMode,
      isMeta: false,
      origin: undefined,
    },
  } as never
}

describe('stickyPromptIndex', () => {
  it('accepts real prompts and queued prompt attachments, while rejecting xml payloads', () => {
    const userPrompt = createUserMessage({
      content: '<system-reminder>\ninternal\n</system-reminder>\nreal prompt',
    })
    const xmlPayload = createUserMessage({
      content: '<bash-stdout>hidden</bash-stdout>',
    })
    const queuedPrompt = createQueuedPromptAttachment('queued prompt')
    const taskNotification = createQueuedPromptAttachment(
      'task notification',
      'task-notification',
    )

    expect(stickyPromptText(userPrompt)).toContain('real prompt')
    expect(stickyPromptText(xmlPayload)).toBeNull()
    expect(stickyPromptText(queuedPrompt)).toBe('queued prompt')
    expect(stickyPromptText(taskNotification)).toBeNull()
  })

  it('tracks the nearest prior sticky prompt across append-only growth', () => {
    const baseMessages = [
      createUserMessage({ content: 'prompt one' }),
      createAssistantMessage({
        content: [{ type: 'text', text: 'reply one' }],
      }),
      createQueuedPromptAttachment('queued prompt'),
      createAssistantMessage({
        content: [{ type: 'text', text: 'reply two' }],
      }),
    ]

    const first = computeStickyPromptPredecessors(baseMessages)
    expect(first.previousStickyPromptIndex[1]).toBe(0)
    expect(first.previousStickyPromptIndex[3]).toBe(2)
    expect(first.previousStickyPromptIndex[4]).toBe(2)

    const second = computeStickyPromptPredecessors(
      [
        ...baseMessages,
        createUserMessage({ content: 'prompt two' }),
        createAssistantMessage({
          content: [{ type: 'text', text: 'reply three' }],
        }),
      ],
      first,
    )

    expect(second.previousStickyPromptIndex[5]).toBe(4)
    expect(second.previousStickyPromptIndex[6]).toBe(4)
  })

  it('falls back correctly when a prior sticky prompt is replaced', () => {
    const baseMessages = [
      createUserMessage({ content: 'prompt one' }),
      createAssistantMessage({
        content: [{ type: 'text', text: 'reply one' }],
      }),
      createQueuedPromptAttachment('queued prompt'),
      createAssistantMessage({
        content: [{ type: 'text', text: 'reply two' }],
      }),
    ]

    const first = computeStickyPromptPredecessors(baseMessages)
    const rewritten = computeStickyPromptPredecessors(
      [
        baseMessages[0]!,
        baseMessages[1]!,
        createQueuedPromptAttachment('<bash-stdout>not a prompt</bash-stdout>'),
        baseMessages[3]!,
      ],
      first,
    )

    expect(rewritten.previousStickyPromptIndex[4]).toBe(0)
  })
})
