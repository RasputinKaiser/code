import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react'
import type { ScrollBoxHandle } from '../../ink/components/ScrollBox.js'
import type { DOMElement } from '../../ink/dom.js'
import type { MatchPosition } from '../../ink/render-to-screen.js'
import type { RenderableMessage } from '../../types/message.js'
import { sleep } from '../../utils/sleep.js'
import { classifyTranscriptSearchCorpusDelta } from './transcriptSearchCorpusDelta.js'
import {
  createTranscriptSearchQueryCache,
  extendTranscriptSearchQueryCache,
  type TranscriptSearchQueryCache,
} from './transcriptSearchQueryCache.js'
import type { FindNearestMatchPointerArgs } from './virtualMessageListSearchState.js'
import {
  disarmVirtualMessageListSearch,
  setVirtualMessageListSearchQuery,
  stepVirtualMessageListSearch,
  type VirtualMessageListSearchCursorState,
} from './virtualMessageListSearchJumpController.js'

type SearchExtractor = (msg: RenderableMessage) => string

export type VirtualMessageListSearchHandle = {
  jumpToIndex: (index: number) => void
  setSearchQuery: (query: string) => void
  nextMatch: () => void
  prevMatch: () => void
  setAnchor: () => void
  warmSearchIndex: () => Promise<number>
  disarmSearch: () => void
}

export type VirtualMessageListJumpState = {
  offsets: Float64Array
  start: number
  getItemElement: (index: number) => DOMElement | null | undefined
  getItemTop: (index: number) => number
  messages: RenderableMessage[]
  scrollToIndex: (index: number) => void
}

export type VirtualMessageListSearchCorpusRef = {
  messages: RenderableMessage[] | null
  extractSearchText: SearchExtractor | null
}

export function syncVirtualMessageListSearchCorpus({
  previousMessages,
  previousExtractor,
  messages,
  extractSearchText,
  cache,
  indexWarmed,
}: {
  previousMessages: RenderableMessage[] | null
  previousExtractor: SearchExtractor | null
  messages: RenderableMessage[]
  extractSearchText: SearchExtractor
  cache: TranscriptSearchQueryCache
  indexWarmed: boolean
}): {
  cache: TranscriptSearchQueryCache
  indexWarmed: boolean
} {
  const corpusDelta =
    previousExtractor === extractSearchText
      ? classifyTranscriptSearchCorpusDelta(previousMessages, messages)
      : { kind: 'reset' as const }

  if (corpusDelta.kind === 'append') {
    extendTranscriptSearchQueryCache({
      cache,
      fromIndex: corpusDelta.fromIndex,
      toIndex: corpusDelta.toIndex,
      getSearchText: index => extractSearchText(messages[index]!),
    })
    if (indexWarmed) {
      for (let index = corpusDelta.fromIndex; index < corpusDelta.toIndex; index += 1) {
        extractSearchText(messages[index]!)
      }
    }
    return {
      cache,
      indexWarmed,
    }
  }

  if (corpusDelta.kind === 'reset') {
    return {
      cache: createTranscriptSearchQueryCache(),
      indexWarmed: false,
    }
  }

  return {
    cache,
    indexWarmed,
  }
}

export function useVirtualMessageListSearchCorpusController({
  messages,
  extractSearchText,
  searchQueryCacheRef,
  indexWarmedRef,
  searchCorpusRef,
}: {
  messages: RenderableMessage[]
  extractSearchText: SearchExtractor
  searchQueryCacheRef: MutableRefObject<TranscriptSearchQueryCache>
  indexWarmedRef: MutableRefObject<boolean>
  searchCorpusRef: MutableRefObject<VirtualMessageListSearchCorpusRef>
}): void {
  useEffect(() => {
    const synced = syncVirtualMessageListSearchCorpus({
      previousMessages: searchCorpusRef.current.messages,
      previousExtractor: searchCorpusRef.current.extractSearchText,
      messages,
      extractSearchText,
      cache: searchQueryCacheRef.current,
      indexWarmed: indexWarmedRef.current,
    })

    searchQueryCacheRef.current = synced.cache
    indexWarmedRef.current = synced.indexWarmed
    searchCorpusRef.current = {
      messages,
      extractSearchText,
    }
  }, [messages, extractSearchText, searchQueryCacheRef, indexWarmedRef, searchCorpusRef])
}

export async function warmVirtualMessageListSearchIndex({
  messages,
  extractSearchText,
  indexWarmedRef,
  sleepImpl = sleep,
  logDebug,
}: {
  messages: RenderableMessage[]
  extractSearchText: SearchExtractor
  indexWarmedRef: MutableRefObject<boolean>
  sleepImpl?: (ms: number) => Promise<void>
  logDebug?: (message: string) => void
}): Promise<number> {
  if (indexWarmedRef.current) return 0

  const CHUNK = 500
  let workMs = 0
  const wallStart = performance.now()
  for (let i = 0; i < messages.length; i += CHUNK) {
    await sleepImpl(0)
    const t0 = performance.now()
    const end = Math.min(i + CHUNK, messages.length)
    for (let j = i; j < end; j += 1) {
      extractSearchText(messages[j]!)
    }
    workMs += performance.now() - t0
  }
  const wallMs = Math.round(performance.now() - wallStart)
  logDebug?.(
    `warmSearchIndex: ${messages.length} msgs · work=${Math.round(workMs)}ms wall=${wallMs}ms chunks=${Math.ceil(messages.length / CHUNK)}`,
  )
  indexWarmedRef.current = true
  return Math.round(workMs)
}

export function useVirtualMessageListSearchJumpController({
  jumpState,
  scrollRef,
  extractSearchText,
  scanElement,
  setPositions,
  onSearchMatchesChange,
  findNearestMatchPointer,
  logDebug,
  headroom,
}: {
  jumpState: MutableRefObject<VirtualMessageListJumpState>
  scrollRef: RefObject<ScrollBoxHandle | null>
  extractSearchText: SearchExtractor
  scanElement?: (element: DOMElement) => MatchPosition[]
  setPositions?: (
    value:
      | null
      | {
          positions: MatchPosition[]
          rowOffset: number
          currentIdx: number
        },
  ) => void
  onSearchMatchesChange?: (total: number, current: number) => void
  findNearestMatchPointer: (args: FindNearestMatchPointerArgs) => number
  logDebug?: (message: string) => void
  headroom: number
}): VirtualMessageListSearchHandle {
  const scanRequestRef = useRef<{
    idx: number
    wantLast: boolean
    tries: number
  } | null>(null)
  const elementPositions = useRef<{
    msgIdx: number
    positions: MatchPosition[]
  }>({
    msgIdx: -1,
    positions: [],
  })
  const startPtrRef = useRef(-1)
  const phantomBurstRef = useRef(0)
  const pendingStepRef = useRef<1 | -1 | 0>(0)
  const stepRef = useRef<(delta: 1 | -1) => void>(() => {})
  const highlightRef = useRef<(ord: number) => void>(() => {})
  const searchState = useRef<VirtualMessageListSearchCursorState>({
    matches: [],
    ptr: 0,
    screenOrd: 0,
    prefixSum: [],
  })
  const searchAnchor = useRef(-1)
  const indexWarmed = useRef(false)
  const searchQueryCacheRef = useRef(createTranscriptSearchQueryCache())
  const searchCorpusRef = useRef<VirtualMessageListSearchCorpusRef>({
    messages: null,
    extractSearchText: null,
  })

  useVirtualMessageListSearchCorpusController({
    messages: jumpState.current.messages,
    extractSearchText,
    searchQueryCacheRef,
    indexWarmedRef: indexWarmed,
    searchCorpusRef,
  })

  const targetFor = useCallback(
    (index: number): number => {
      const top = jumpState.current.getItemTop(index)
      return Math.max(0, top - headroom)
    },
    [headroom, jumpState],
  )

  const highlight = useCallback(
    (ord: number): void => {
      const scrollBox = scrollRef.current
      const { msgIdx, positions } = elementPositions.current
      if (!scrollBox || positions.length === 0 || msgIdx < 0) {
        setPositions?.(null)
        return
      }

      const idx = Math.max(0, Math.min(ord, positions.length - 1))
      const position = positions[idx]!
      const top = jumpState.current.getItemTop(msgIdx)
      const viewportTop = scrollBox.getViewportTop()
      let localOffset = top - scrollBox.getScrollTop()
      const viewportHeight = scrollBox.getViewportHeight()
      let screenRow = viewportTop + localOffset + position.row

      if (screenRow < viewportTop || screenRow >= viewportTop + viewportHeight) {
        scrollBox.scrollTo(Math.max(0, top + position.row - headroom))
        localOffset = top - scrollBox.getScrollTop()
        screenRow = viewportTop + localOffset + position.row
      }

      setPositions?.({
        positions,
        rowOffset: viewportTop + localOffset,
        currentIdx: idx,
      })

      const state = searchState.current
      const total = state.prefixSum.at(-1) ?? 0
      const current = (state.prefixSum[state.ptr] ?? 0) + idx + 1
      onSearchMatchesChange?.(total, current)
      logDebug?.(
        `highlight(i=${msgIdx}, ord=${idx}/${positions.length}): pos={row:${position.row},col:${position.col}} lo=${localOffset} screenRow=${screenRow} badge=${current}/${total}`,
      )
    },
    [headroom, jumpState, logDebug, onSearchMatchesChange, scrollRef, setPositions],
  )
  highlightRef.current = highlight

  const [seekGen, setSeekGen] = useState(0)
  const bumpSeek = useCallback(() => setSeekGen(gen => gen + 1), [])

  useEffect(() => {
    const request = scanRequestRef.current
    if (!request) return

    const { idx, wantLast, tries } = request
    const scrollBox = scrollRef.current
    if (!scrollBox) return

    const { getItemElement, getItemTop, scrollToIndex } = jumpState.current
    const element = getItemElement(idx)
    const height = element?.yogaNode?.getComputedHeight() ?? 0
    if (!element || height === 0) {
      if (tries > 1) {
        scanRequestRef.current = null
        logDebug?.(`seek(i=${idx}): no mount after scrollToIndex, skip`)
        stepRef.current(wantLast ? -1 : 1)
        return
      }

      scanRequestRef.current = {
        idx,
        wantLast,
        tries: tries + 1,
      }
      scrollToIndex(idx)
      bumpSeek()
      return
    }

    scanRequestRef.current = null
    scrollBox.scrollTo(Math.max(0, getItemTop(idx) - headroom))
    const positions = scanElement?.(element) ?? []
    elementPositions.current = {
      msgIdx: idx,
      positions,
    }
    logDebug?.(`seek(i=${idx} t=${tries}): ${positions.length} positions`)
    if (positions.length === 0) {
      if (++phantomBurstRef.current > 20) {
        phantomBurstRef.current = 0
        return
      }
      stepRef.current(wantLast ? -1 : 1)
      return
    }

    phantomBurstRef.current = 0
    const ord = wantLast ? positions.length - 1 : 0
    searchState.current.screenOrd = ord
    startPtrRef.current = -1
    highlightRef.current(ord)
    const pending = pendingStepRef.current
    if (pending) {
      pendingStepRef.current = 0
      stepRef.current(pending)
    }
  }, [bumpSeek, headroom, jumpState, logDebug, scanElement, scrollRef, seekGen])

  const jump = useCallback(
    (index: number, wantLast: boolean): void => {
      const scrollBox = scrollRef.current
      if (!scrollBox) return

      const { getItemElement, messages, scrollToIndex } = jumpState.current
      if (index < 0 || index >= messages.length) return

      setPositions?.(null)
      elementPositions.current = {
        msgIdx: -1,
        positions: [],
      }
      scanRequestRef.current = {
        idx: index,
        wantLast,
        tries: 0,
      }
      const element = getItemElement(index)
      const height = element?.yogaNode?.getComputedHeight() ?? 0
      if (element && height > 0) {
        scrollBox.scrollTo(targetFor(index))
      } else {
        scrollToIndex(index)
      }
      bumpSeek()
    },
    [bumpSeek, jumpState, scrollRef, setPositions, targetFor],
  )

  const step = useCallback(
    (delta: 1 | -1): void => {
      stepVirtualMessageListSearch({
        delta,
        searchStateRef: searchState,
        scanRequestRef,
        pendingStepRef,
        startPtrRef,
        elementPositionsRef: elementPositions,
        highlight,
        jump,
        setPositions: setPositions ? value => setPositions(value) : undefined,
        onSearchMatchesChange,
        logDebug,
      })
    },
    [highlight, jump, logDebug, onSearchMatchesChange, setPositions],
  )
  stepRef.current = step

  const jumpToIndex = useCallback(
    (index: number) => {
      const scrollBox = scrollRef.current
      if (scrollBox) {
        scrollBox.scrollTo(targetFor(index))
      }
    },
    [scrollRef, targetFor],
  )

  const setSearchQuery = useCallback(
    (query: string) => {
      const { messages, offsets, start, getItemTop } = jumpState.current
      setVirtualMessageListSearchQuery({
        query,
        messages,
        extractSearchText,
        searchQueryCache: searchQueryCacheRef.current,
        searchStateRef: searchState,
        scanRequestRef,
        elementPositionsRef: elementPositions,
        startPtrRef,
        searchAnchorRef: searchAnchor,
        scrollBox: scrollRef.current,
        offsets,
        start,
        getItemTop,
        findNearestMatchPointer,
        jump,
        setPositions: setPositions ? value => setPositions(value) : undefined,
        onSearchMatchesChange,
        logDebug,
      })
    },
    [
      extractSearchText,
      findNearestMatchPointer,
      jump,
      jumpState,
      logDebug,
      onSearchMatchesChange,
      scrollRef,
      setPositions,
    ],
  )

  const setAnchor = useCallback(() => {
    const scrollBox = scrollRef.current
    if (scrollBox) {
      searchAnchor.current = scrollBox.getScrollTop()
    }
  }, [scrollRef])

  const disarmSearch = useCallback(() => {
    disarmVirtualMessageListSearch({
      setPositions: setPositions ? value => setPositions(value) : undefined,
      scanRequestRef,
      elementPositionsRef: elementPositions,
      startPtrRef,
    })
  }, [setPositions])

  const warmSearchIndex = useCallback(() => {
    return warmVirtualMessageListSearchIndex({
      messages: jumpState.current.messages,
      extractSearchText,
      indexWarmedRef: indexWarmed,
      logDebug,
    })
  }, [extractSearchText, jumpState, logDebug])

  return useMemo(
    () => ({
      jumpToIndex,
      setSearchQuery,
      nextMatch: () => step(1),
      prevMatch: () => step(-1),
      setAnchor,
      warmSearchIndex,
      disarmSearch,
    }),
    [disarmSearch, jumpToIndex, setAnchor, setSearchQuery, step, warmSearchIndex],
  )
}
