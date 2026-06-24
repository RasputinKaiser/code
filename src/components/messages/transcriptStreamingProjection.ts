import type { Message as MessageType } from '../../types/message.js'
import {
  createAssistantMessage,
  deriveUUID,
  normalizeMessages,
  type StreamingThinking,
  type StreamingToolUse,
} from '../../utils/messages.js'

export type StreamingThinkingMeta = Pick<
  StreamingThinking,
  'isStreaming' | 'streamingEndedAt'
>

export type TranscriptStreamingProjectionParams = {
  hidePastThinking: boolean
  streamingThinkingMeta?: StreamingThinkingMeta | null
  normalizedLastThinkingBlockId: string | null
  latestBashOutputUUID: string | null
  normalizedToolUseIDs: ReadonlySet<string>
  streamingToolUses: StreamingToolUse[]
  inProgressToolUseIDs: ReadonlySet<string>
  now?: number
}

export type TranscriptStreamingProjectionResult = {
  isStreamingThinkingVisible: boolean
  lastThinkingBlockId: string | null
  latestBashOutputUUID: string | null
  streamingToolUsesWithoutInProgress: StreamingToolUse[]
  syntheticStreamingToolUseMessages: MessageType[]
}

export function computeTranscriptStreamingProjection(
  params: TranscriptStreamingProjectionParams,
): TranscriptStreamingProjectionResult {
  const now = params.now ?? Date.now()
  const isStreamingThinkingVisible = isStreamingThinkingVisibleFromMeta(
    params.streamingThinkingMeta,
    now,
  )

  const lastThinkingBlockId = !params.hidePastThinking
    ? null
    : isStreamingThinkingVisible
      ? 'streaming'
      : params.normalizedLastThinkingBlockId

  const streamingToolUsesWithoutInProgress = params.streamingToolUses.filter(
    streamingToolUse =>
      !params.inProgressToolUseIDs.has(streamingToolUse.contentBlock.id) &&
      !params.normalizedToolUseIDs.has(streamingToolUse.contentBlock.id),
  )

  const syntheticStreamingToolUseMessages =
    streamingToolUsesWithoutInProgress.flatMap(streamingToolUse => {
      const message = createAssistantMessage({
        content: [streamingToolUse.contentBlock],
      })
      message.uuid = deriveUUID(streamingToolUse.contentBlock.id, 0)
      return normalizeMessages([message])
    })

  return {
    isStreamingThinkingVisible,
    lastThinkingBlockId,
    latestBashOutputUUID: params.latestBashOutputUUID,
    streamingToolUsesWithoutInProgress,
    syntheticStreamingToolUseMessages,
  }
}

export function isStreamingThinkingVisibleFromMeta(
  streamingThinking: StreamingThinkingMeta | null | undefined,
  now: number,
): boolean {
  if (!streamingThinking) return false
  if (streamingThinking.isStreaming) return true
  if (streamingThinking.streamingEndedAt) {
    return now - streamingThinking.streamingEndedAt < 30000
  }
  return false
}
