import type { RefObject } from 'react'
import { useMemo, useRef } from 'react'
import type { ScrollBoxHandle } from '../../ink/components/ScrollBox.js'
import type { Tools } from '../../Tool.js'
import type { RenderableMessage, Message as MessageType } from '../../types/message.js'
import type { MessageLookups, StreamingToolUse } from '../../utils/messages.js'
import type { UnseenDivider } from '../FullscreenLayout.js'
import type { MessageActionsState } from '../messageActions.js'
import { computeIncrementalNormalizedMessages } from './incrementalNormalizeMessages.js'
import { computeTranscriptProjection } from './transcriptProjection.js'
import { createTranscriptSearchTextExtractor } from './transcriptSearchTextExtractor.js'
import {
  computeTranscriptStreamingProjection,
  type StreamingThinkingMeta,
} from './transcriptStreamingProjection.js'

export type SliceAnchor = {
  uuid: string
  idx: number
} | null

/** Exported for testing. Mutates anchorRef when the window needs to advance. */
export function computeSliceStart(
  collapsed: ReadonlyArray<{ uuid: string }>,
  anchorRef: { current: SliceAnchor },
  cap: number,
  step: number,
): number {
  const anchor = anchorRef.current
  const anchorIdx = anchor
    ? collapsed.findIndex(m => m.uuid === anchor.uuid)
    : -1
  // Anchor found -> use it. Anchor lost -> fall back to stored index
  // (clamped) so collapse-regrouping uuid churn doesn't reset to 0.
  let start =
    anchorIdx >= 0
      ? anchorIdx
      : anchor
        ? Math.min(anchor.idx, Math.max(0, collapsed.length - cap))
        : 0
  if (collapsed.length - start > cap + step) {
    start = collapsed.length - cap
  }
  // Refresh anchor from whatever lives at the current start - heals a
  // stale uuid after fallback and captures a new one after advancement.
  const msgAtStart = collapsed[start]
  if (msgAtStart && (anchor?.uuid !== msgAtStart.uuid || anchor.idx !== start)) {
    anchorRef.current = { uuid: msgAtStart.uuid, idx: start }
  } else if (!msgAtStart && anchor) {
    anchorRef.current = null
  }
  return start
}

export function computeDividerBeforeIndex(
  unseenDivider: UnseenDivider | undefined,
  renderableMessages: readonly RenderableMessage[],
): number {
  if (!unseenDivider) return -1
  const prefix = unseenDivider.firstUnseenUuid.slice(0, 24)
  return renderableMessages.findIndex(m => m.uuid.slice(0, 24) === prefix)
}

export function computeSelectedIndex(
  cursor: MessageActionsState | null | undefined,
  renderableMessages: readonly RenderableMessage[],
): number {
  if (!cursor) return -1
  return renderableMessages.findIndex(m => m.uuid === cursor.uuid)
}

export function selectRenderableMessages(
  collapsed: readonly RenderableMessage[],
  options: {
    virtualScrollRuntimeGate: boolean
    disableRenderCap: boolean
    cap: number
    step: number
    anchorRef: { current: SliceAnchor }
    renderRange?: readonly [number, number]
  },
): readonly RenderableMessage[] {
  const capApplies = !options.virtualScrollRuntimeGate && !options.disableRenderCap
  const sliceStart = capApplies
    ? computeSliceStart(collapsed, options.anchorRef, options.cap, options.step)
    : 0
  if (options.renderRange) {
    return collapsed.slice(options.renderRange[0], options.renderRange[1])
  }
  if (sliceStart > 0) {
    return collapsed.slice(sliceStart)
  }
  return collapsed
}

export type TranscriptViewModel = {
  isStreamingThinkingVisible: boolean
  lastThinkingBlockId: string | null
  latestBashOutputUUID: string | null
  hasTruncatedMessages: boolean
  hiddenMessageCount: number
  lookups: MessageLookups
  renderableMessages: readonly RenderableMessage[]
  streamingToolUseIDs: Set<string>
  dividerBeforeIndex: number
  selectedIdx: number
  extractSearchText: ReturnType<typeof createTranscriptSearchTextExtractor>
  virtualScrollRuntimeGate: boolean
}

export function useTranscriptViewModel(args: {
  messages: MessageType[]
  hidePastThinking: boolean
  streamingThinkingMeta?: StreamingThinkingMeta | null
  streamingToolUses: StreamingToolUse[]
  inProgressToolUseIDs: Set<string>
  screen: string
  showAllInTranscript: boolean
  scrollRef?: RefObject<ScrollBoxHandle | null>
  disableVirtualScroll: boolean
  disableRenderCap: boolean
  isBriefOnly: boolean
  tools: Tools
  verbose: boolean
  fullscreenEnabled: boolean
  briefToolNames: string[]
  dropTextToolNames: string[]
  maxTranscriptMessages: number
  maxMessagesWithoutVirtualization: number
  messageCapStep: number
  unseenDivider?: UnseenDivider
  cursor?: MessageActionsState | null
  renderRange?: readonly [number, number]
}): TranscriptViewModel {
  const normalizedMessagesCacheRef = useRef<
    ReturnType<typeof computeIncrementalNormalizedMessages>
  >()
  const transcriptProjectionCacheRef = useRef<
    ReturnType<typeof computeTranscriptProjection>['cache']
  >()
  const sliceAnchorRef = useRef<SliceAnchor>(null)

  const normalizedState = useMemo(() => {
    const next = computeIncrementalNormalizedMessages(
      args.messages,
      normalizedMessagesCacheRef.current,
    )
    normalizedMessagesCacheRef.current = next
    return next
  }, [args.messages])

  const {
    isStreamingThinkingVisible,
    lastThinkingBlockId,
    latestBashOutputUUID,
    syntheticStreamingToolUseMessages,
  } = useMemo(
    () =>
      computeTranscriptStreamingProjection({
        hidePastThinking: args.hidePastThinking,
        streamingThinkingMeta: args.streamingThinkingMeta,
        normalizedLastThinkingBlockId: normalizedState.lastThinkingBlockId,
        latestBashOutputUUID: normalizedState.latestBashOutputUUID,
        normalizedToolUseIDs: normalizedState.normalizedToolUseIDs,
        streamingToolUses: args.streamingToolUses,
        inProgressToolUseIDs: args.inProgressToolUseIDs,
      }),
    [
      args.hidePastThinking,
      args.streamingThinkingMeta,
      normalizedState.lastThinkingBlockId,
      normalizedState.latestBashOutputUUID,
      normalizedState.normalizedToolUseIDs,
      args.streamingToolUses,
      args.inProgressToolUseIDs,
    ],
  )

  const isTranscriptMode = args.screen === 'transcript'
  const virtualScrollRuntimeGate = args.scrollRef != null && !args.disableVirtualScroll
  const shouldTruncate =
    isTranscriptMode && !args.showAllInTranscript && !virtualScrollRuntimeGate

  const { collapsed, lookups, hasTruncatedMessages, hiddenMessageCount } =
    useMemo(() => {
      const projection = computeTranscriptProjection(
        {
          normalizedMessages: normalizedState.normalizedMessages,
          syntheticStreamingToolUseMessages,
          tools: args.tools,
          verbose: args.verbose,
          isTranscriptMode,
          isBriefOnly: args.isBriefOnly,
          shouldTruncate,
          fullscreenEnabled: args.fullscreenEnabled,
          briefToolNames: args.briefToolNames,
          dropTextToolNames: args.dropTextToolNames,
          maxTranscriptMessages: args.maxTranscriptMessages,
        },
        transcriptProjectionCacheRef.current,
      )
      transcriptProjectionCacheRef.current = projection.cache
      return projection
    }, [
      args.tools,
      args.verbose,
      args.isBriefOnly,
      args.fullscreenEnabled,
      args.briefToolNames,
      args.dropTextToolNames,
      args.maxTranscriptMessages,
      normalizedState.normalizedMessages,
      syntheticStreamingToolUseMessages,
      isTranscriptMode,
      shouldTruncate,
    ])

  const renderableMessages = useMemo(
    () =>
      selectRenderableMessages(collapsed, {
        virtualScrollRuntimeGate,
        disableRenderCap: args.disableRenderCap,
        cap: args.maxMessagesWithoutVirtualization,
        step: args.messageCapStep,
        anchorRef: sliceAnchorRef,
        renderRange: args.renderRange,
      }),
    [
      collapsed,
      virtualScrollRuntimeGate,
      args.disableRenderCap,
      args.maxMessagesWithoutVirtualization,
      args.messageCapStep,
      args.renderRange,
    ],
  )

  const streamingToolUseIDs = useMemo(
    () => new Set(args.streamingToolUses.map(t => t.contentBlock.id)),
    [args.streamingToolUses],
  )

  const dividerBeforeIndex = useMemo(
    () => computeDividerBeforeIndex(args.unseenDivider, renderableMessages),
    [args.unseenDivider, renderableMessages],
  )
  const selectedIdx = useMemo(
    () => computeSelectedIndex(args.cursor, renderableMessages),
    [args.cursor, renderableMessages],
  )

  const extractSearchText = useMemo(
    () => createTranscriptSearchTextExtractor({ tools: args.tools, lookups }),
    [args.tools, lookups],
  )

  return {
    isStreamingThinkingVisible,
    lastThinkingBlockId,
    latestBashOutputUUID,
    hasTruncatedMessages,
    hiddenMessageCount,
    lookups,
    renderableMessages,
    streamingToolUseIDs,
    dividerBeforeIndex,
    selectedIdx,
    extractSearchText,
    virtualScrollRuntimeGate,
  }
}
