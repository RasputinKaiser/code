import { describe, expect, it } from 'bun:test'
import { createAssistantMessage, createUserMessage } from '../../utils/messages.js'
import { computeIncrementalNormalizedMessages } from './incrementalNormalizeMessages.js'

describe('computeIncrementalNormalizedMessages', () => {
  it('reuses the normalized prefix for append-only growth', () => {
    const firstTurn = [
      createUserMessage({ content: 'first prompt' }),
      createAssistantMessage({
        content: [{ type: 'text', text: 'first reply' }],
      }),
    ]

    const first = computeIncrementalNormalizedMessages(firstTurn)
    const secondTurn = [
      ...firstTurn,
      createUserMessage({ content: 'second prompt' }),
      createAssistantMessage({
        content: [{ type: 'text', text: 'second reply' }],
      }),
    ]

    const second = computeIncrementalNormalizedMessages(secondTurn, first)

    expect(second.firstChangedNormalizedIndex).toBe(
      first.normalizedMessages.length,
    )
    expect(second.normalizedMessages[0]).toBe(first.normalizedMessages[0])
    expect(second.normalizedMessages[1]).toBe(first.normalizedMessages[1])
    expect(second.normalizedMessages).toHaveLength(4)
  })

  it('tracks tool use ids incrementally', () => {
    const toolUse = createAssistantMessage({
      content: [
        {
          type: 'tool_use',
          id: 'tool-1',
          name: 'Read',
          input: { file_path: 'README.md' },
        } as never,
      ],
    })

    const first = computeIncrementalNormalizedMessages([
      createUserMessage({ content: 'read the readme' }),
      toolUse,
    ])
    expect(first.normalizedToolUseIDs.has('tool-1')).toBe(true)

    const second = computeIncrementalNormalizedMessages(
      [
        ...first.rawMessages,
        createUserMessage({
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-1',
              content: 'done',
              is_error: false,
            } as never,
          ],
        }),
        createAssistantMessage({
          content: [
            {
              type: 'tool_use',
              id: 'tool-2',
              name: 'Grep',
              input: { pattern: 'TODO' },
            } as never,
          ],
        }),
      ],
      first,
    )

    expect(second.normalizedToolUseIDs.has('tool-1')).toBe(true)
    expect(second.normalizedToolUseIDs.has('tool-2')).toBe(true)
  })

  it('tracks last-thinking visibility and latest bash output incrementally', () => {
    const first = computeIncrementalNormalizedMessages([
      createUserMessage({ content: 'first prompt' }),
      createAssistantMessage({
        content: [{ type: 'thinking', thinking: 'reasoning' } as never],
      }),
      createUserMessage({
        content: [{ type: 'text', text: '<bash-stdout>pwd</bash-stdout>' }],
      }),
    ])

    expect(first.lastThinkingBlockId).toBe('no-thinking')
    expect(first.latestBashOutputUUID).toBe(first.normalizedMessages[2]?.uuid)

    const second = computeIncrementalNormalizedMessages(
      [
        ...first.rawMessages,
        createUserMessage({ content: 'second prompt' }),
        createAssistantMessage({
          content: [{ type: 'text', text: 'second reply' }],
        }),
      ],
      first,
    )

    expect(second.lastThinkingBlockId).toBe('no-thinking')
    expect(second.latestBashOutputUUID).toBe(first.latestBashOutputUUID)

    const third = computeIncrementalNormalizedMessages(
      [
        ...second.rawMessages,
        createAssistantMessage({
          content: [{ type: 'thinking', thinking: 'second reasoning' } as never],
        }),
      ],
      second,
    )

    expect(third.lastThinkingBlockId).toBe(
      third.normalizedMessages.at(-1)?.uuid + ':0',
    )
    expect(third.latestBashOutputUUID).toBe(first.latestBashOutputUUID)
  })

  it('falls back to a full rebuild on mid-history edits', () => {
    const first = computeIncrementalNormalizedMessages([
      createUserMessage({ content: 'first prompt' }),
      createAssistantMessage({
        content: [{ type: 'text', text: 'first reply' }],
      }),
    ])

    const edited = computeIncrementalNormalizedMessages([
      createUserMessage({ content: 'edited prompt' }),
      createAssistantMessage({
        content: [{ type: 'text', text: 'first reply' }],
      }),
    ], first)

    expect(edited.firstChangedNormalizedIndex).toBe(0)
    expect(edited.normalizedMessages[0]).not.toBe(first.normalizedMessages[0])
  })

  it('incrementally updates the last raw message when replaced in place', () => {
    const userMsg = createUserMessage({ content: 'prompt' })
    const assistantMsg = createAssistantMessage({
      content: [{ type: 'text', text: 'reply' }],
    })
    const progressMsg = {
      type: 'progress',
      data: { type: 'bash_progress', elapsedTimeSeconds: 1, taskId: 't1' },
      parentToolUseID: 'parent-1',
      toolUseID: 'tool-1',
      uuid: 'progress-1',
      timestamp: new Date().toISOString(),
      message: { content: [] },
    } as never

    const firstMessages = [userMsg, assistantMsg, progressMsg]
    const first = computeIncrementalNormalizedMessages(firstMessages)
    expect(first.normalizedMessages).toHaveLength(3)
    expect(first.normalizedMessages[2]).toBe(first.normalizedMessages[2])

    // Replace the last progress message in place
    const progressMsg2 = {
      ...progressMsg,
      data: { type: 'bash_progress', elapsedTimeSeconds: 2, taskId: 't1' },
    } as never
    const secondMessages = [userMsg, assistantMsg, progressMsg2]
    const second = computeIncrementalNormalizedMessages(secondMessages, first)

    // Should not fall back to full rebuild
    expect(second.firstChangedNormalizedIndex).toBe(2)
    // Prefix should be the exact same objects
    expect(second.normalizedMessages[0]).toBe(first.normalizedMessages[0])
    expect(second.normalizedMessages[1]).toBe(first.normalizedMessages[1])
    // Last entry should be the new progress message
    expect(second.normalizedMessages[2]).toBe(progressMsg2)
    expect(second.normalizedMessages).toHaveLength(3)
  })

  it('handles in-place replacement of last assistant message incrementally', () => {
    const userMsg = createUserMessage({ content: 'prompt' })
    const assistantMsg = createAssistantMessage({
      content: [{ type: 'text', text: 'reply' }],
    })

    const firstMessages = [userMsg, assistantMsg]
    const first = computeIncrementalNormalizedMessages(firstMessages)
    expect(first.normalizedMessages).toHaveLength(2)
    expect(first.lastThinkingBlockId).toBe('no-thinking')

    const assistantMsg2 = createAssistantMessage({
      content: [
        { type: 'thinking', thinking: 'reasoning' } as never,
        { type: 'text', text: 'reply' },
      ],
    })
    const secondMessages = [userMsg, assistantMsg2]
    const second = computeIncrementalNormalizedMessages(secondMessages, first)

    // Should splice incrementally, not rebuild from scratch
    expect(second.firstChangedNormalizedIndex).toBe(1)
    expect(second.normalizedMessages[0]).toBe(first.normalizedMessages[0])
    // Old assistant text block was at index 1; new thinking block is index 1, text is index 2
    expect(second.normalizedMessages).toHaveLength(3)
    expect(second.lastThinkingBlockId).toBe(
      second.normalizedMessages[1]?.uuid + ':0',
    )
  })
})
