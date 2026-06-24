import type { MutableRefObject } from 'react'
import type { ScrollBoxHandle } from '../../ink/components/ScrollBox.js'
import type { MatchPosition } from '../../ink/render-to-screen.js'
import type { RenderableMessage } from '../../types/message.js'
import type { TranscriptSearchQueryCache } from './transcriptSearchQueryCache.js'
import { resolveVirtualMessageListSearchState } from './virtualMessageListSearchState.js'

export type VirtualMessageListSearchCursorState = {
  matches: number[]
  ptr: number
  screenOrd: number
  prefixSum: number[]
}

type ScanRequest = {
  idx: number
  wantLast: boolean
  tries: number
}

type SearchStepArgs = {
  delta: 1 | -1
  searchStateRef: MutableRefObject<VirtualMessageListSearchCursorState>
  scanRequestRef: MutableRefObject<ScanRequest | null>
  pendingStepRef: MutableRefObject<1 | -1 | 0>
  startPtrRef: MutableRefObject<number>
  elementPositionsRef: MutableRefObject<{
    msgIdx: number
    positions: MatchPosition[]
  }>
  highlight: (ord: number) => void
  jump: (index: number, wantLast: boolean) => void
  setPositions?: (value: null) => void
  onSearchMatchesChange?: (total: number, current: number) => void
  logDebug?: (message: string) => void
}

export function stepVirtualMessageListSearch({
  delta,
  searchStateRef,
  scanRequestRef,
  pendingStepRef,
  startPtrRef,
  elementPositionsRef,
  highlight,
  jump,
  setPositions,
  onSearchMatchesChange,
  logDebug,
}: SearchStepArgs): void {
  const st = searchStateRef.current
  const { matches, prefixSum } = st
  const total = prefixSum.at(-1) ?? 0
  if (matches.length === 0) return

  if (scanRequestRef.current) {
    pendingStepRef.current = delta
    return
  }
  if (startPtrRef.current < 0) startPtrRef.current = st.ptr

  const { positions } = elementPositionsRef.current
  const newOrd = st.screenOrd + delta
  if (newOrd >= 0 && newOrd < positions.length) {
    st.screenOrd = newOrd
    highlight(newOrd)
    startPtrRef.current = -1
    return
  }

  const ptr = (st.ptr + delta + matches.length) % matches.length
  if (ptr === startPtrRef.current) {
    setPositions?.(null)
    startPtrRef.current = -1
    logDebug?.(`step: wraparound at ptr=${ptr}, all ${matches.length} msgs phantoms`)
    return
  }

  st.ptr = ptr
  st.screenOrd = 0
  jump(matches[ptr]!, delta < 0)
  const placeholder =
    delta < 0 ? (prefixSum[ptr + 1] ?? total) : (prefixSum[ptr]! + 1)
  onSearchMatchesChange?.(total, placeholder)
}

type SetSearchQueryArgs = {
  query: string
  messages: RenderableMessage[]
  extractSearchText: (message: RenderableMessage) => string
  searchQueryCache: TranscriptSearchQueryCache
  searchStateRef: MutableRefObject<VirtualMessageListSearchCursorState>
  scanRequestRef: MutableRefObject<ScanRequest | null>
  elementPositionsRef: MutableRefObject<{
    msgIdx: number
    positions: MatchPosition[]
  }>
  startPtrRef: MutableRefObject<number>
  searchAnchorRef: MutableRefObject<number>
  scrollBox: Pick<ScrollBoxHandle, 'getScrollTop' | 'scrollTo'> | null
  offsets: Float64Array
  start: number
  getItemTop: (index: number) => number
  findNearestMatchPointer: (args: {
    matches: number[]
    offsets: Float64Array
    origin: number
    targetTop: number
  }) => number
  jump: (index: number, wantLast: boolean) => void
  setPositions?: (value: null) => void
  onSearchMatchesChange?: (total: number, current: number) => void
  logDebug?: (message: string) => void
}

export function setVirtualMessageListSearchQuery({
  query,
  messages,
  extractSearchText,
  searchQueryCache,
  searchStateRef,
  scanRequestRef,
  elementPositionsRef,
  startPtrRef,
  searchAnchorRef,
  scrollBox,
  offsets,
  start,
  getItemTop,
  findNearestMatchPointer,
  jump,
  setPositions,
  onSearchMatchesChange,
  logDebug,
}: SetSearchQueryArgs): void {
  scanRequestRef.current = null
  elementPositionsRef.current = { msgIdx: -1, positions: [] }
  startPtrRef.current = -1
  setPositions?.(null)

  const firstTop = getItemTop(start)
  const origin = firstTop >= 0 ? firstTop - offsets[start]! : 0
  const currentScrollTop = scrollBox ? scrollBox.getScrollTop() : null
  const { state, total, placeholderCurrent, jumpIndex, restoreScrollTop } =
    resolveVirtualMessageListSearchState({
      cache: searchQueryCache,
      query,
      messageCount: messages.length,
      getSearchText: index => extractSearchText(messages[index]!),
      searchAnchorTop: searchAnchorRef.current,
      currentScrollTop,
      offsets,
      origin,
      findNearestMatchPointer,
    })

  if (state.matches.length > 0 && currentScrollTop !== null) {
    const targetTop =
      searchAnchorRef.current >= 0 ? searchAnchorRef.current : currentScrollTop
    logDebug?.(
      `setSearchQuery('${query}'): ${state.matches.length} msgs · ptr=${state.ptr} msgIdx=${state.matches[state.ptr]} curTop=${targetTop} origin=${origin}`,
    )
  }

  searchStateRef.current = state

  if (jumpIndex !== null) {
    jump(jumpIndex, true)
  } else if (restoreScrollTop !== null && scrollBox) {
    scrollBox.scrollTo(restoreScrollTop)
  }

  onSearchMatchesChange?.(total, placeholderCurrent)
}

export function disarmVirtualMessageListSearch({
  setPositions,
  scanRequestRef,
  elementPositionsRef,
  startPtrRef,
}: {
  setPositions?: (value: null) => void
  scanRequestRef: MutableRefObject<ScanRequest | null>
  elementPositionsRef: MutableRefObject<{
    msgIdx: number
    positions: MatchPosition[]
  }>
  startPtrRef: MutableRefObject<number>
}): void {
  setPositions?.(null)
  scanRequestRef.current = null
  elementPositionsRef.current = { msgIdx: -1, positions: [] }
  startPtrRef.current = -1
}
