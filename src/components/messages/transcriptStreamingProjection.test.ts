import { describe, expect, it } from 'bun:test'
import { computeTranscriptStreamingProjection } from './transcriptStreamingProjection.js'

describe('computeTranscriptStreamingProjection', () => {
  it('preserves the existing streaming-thinking visibility and hide-past override', () => {
    const base = {
      latestBashOutputUUID: 'bash-uuid',
      normalizedToolUseIDs: new Set<string>(),
      streamingToolUses: [],
      inProgressToolUseIDs: new Set<string>(),
    }

    const stillVisible = computeTranscriptStreamingProjection({
      ...base,
      hidePastThinking: true,
      streamingThinkingMeta: {
        thinking: 'still visible',
        isStreaming: false,
        streamingEndedAt: 1000,
      },
      normalizedLastThinkingBlockId: 'normalized-thinking',
      now: 1000 + 29999,
    })
    expect(stillVisible.isStreamingThinkingVisible).toBe(true)
    expect(stillVisible.lastThinkingBlockId).toBe('streaming')

    const expired = computeTranscriptStreamingProjection({
      ...base,
      hidePastThinking: true,
      streamingThinkingMeta: {
        thinking: 'expired',
        isStreaming: false,
        streamingEndedAt: 1000,
      },
      normalizedLastThinkingBlockId: 'normalized-thinking',
      now: 1000 + 30000,
    })
    expect(expired.isStreamingThinkingVisible).toBe(false)
    expect(expired.lastThinkingBlockId).toBe('normalized-thinking')
  })

  it('filters normalized and in-progress streaming tool uses before synthesizing messages', () => {
    const projection = computeTranscriptStreamingProjection({
      hidePastThinking: false,
      streamingThinking: null,
      normalizedLastThinkingBlockId: null,
      latestBashOutputUUID: null,
      normalizedToolUseIDs: new Set(['normalized']),
      inProgressToolUseIDs: new Set(['in-progress']),
      streamingToolUses: [
        {
          contentBlock: {
            type: 'tool_use',
            id: 'normalized',
            name: 'Bash',
            input: { cmd: 'normalized' },
          },
        },
        {
          contentBlock: {
            type: 'tool_use',
            id: 'in-progress',
            name: 'Bash',
            input: { cmd: 'in-progress' },
          },
        },
        {
          contentBlock: {
            type: 'tool_use',
            id: 'fresh',
            name: 'Bash',
            input: { cmd: 'fresh' },
          },
        },
      ],
    })

    expect(projection.streamingToolUsesWithoutInProgress).toHaveLength(1)
    expect(projection.streamingToolUsesWithoutInProgress[0]?.contentBlock.id).toBe(
      'fresh',
    )
    expect(projection.syntheticStreamingToolUseMessages).toHaveLength(1)
    expect(projection.syntheticStreamingToolUseMessages[0]?.uuid.startsWith('fresh')).toBe(
      true,
    )
  })
})
