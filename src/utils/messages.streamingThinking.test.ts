import { describe, expect, mock, test } from 'bun:test'

import {
  handleMessageFromStream,
  type StreamingThinking,
} from './messages.js'

describe('handleMessageFromStream streaming thinking', () => {
  test('streams thinking deltas live and finalizes on the assistant message', () => {
    const onMessage = mock(() => {})
    const onUpdateLength = mock(() => {})
    const onSetStreamMode = mock(() => {})
    const onStreamingToolUses = mock(() => {})

    let currentThinking: StreamingThinking | null = null
    const onStreamingThinking = (
      update: (current: StreamingThinking | null) => StreamingThinking | null,
    ) => {
      currentThinking = update(currentThinking)
    }

    handleMessageFromStream(
      {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'thinking' },
        },
      } as never,
      onMessage,
      onUpdateLength,
      onSetStreamMode,
      onStreamingToolUses,
      undefined,
      onStreamingThinking,
    )

    expect(onSetStreamMode).toHaveBeenCalledWith('thinking')
    expect(currentThinking).toEqual({
      thinking: '',
      isStreaming: true,
    })

    handleMessageFromStream(
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: 'step 1' },
        },
      } as never,
      onMessage,
      onUpdateLength,
      onSetStreamMode,
      onStreamingToolUses,
      undefined,
      onStreamingThinking,
    )

    expect(onUpdateLength).toHaveBeenCalledWith('step 1')
    expect(currentThinking).toEqual({
      thinking: 'step 1',
      isStreaming: true,
    })

    handleMessageFromStream(
      {
        type: 'assistant',
        message: {
          content: [{ type: 'thinking', thinking: 'final reasoning' }],
        },
      } as never,
      onMessage,
      onUpdateLength,
      onSetStreamMode,
      onStreamingToolUses,
      undefined,
      onStreamingThinking,
    )

    expect(onMessage).toHaveBeenCalledTimes(1)
    expect(currentThinking?.thinking).toBe('final reasoning')
    expect(currentThinking?.isStreaming).toBe(false)
    expect(typeof currentThinking?.streamingEndedAt).toBe('number')
  })
})
