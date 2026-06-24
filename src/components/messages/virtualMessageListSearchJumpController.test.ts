import { describe, expect, it, mock } from 'bun:test'
import {
  createUserMessage,
  getContentText,
} from '../../utils/messages.js'
import { createTranscriptSearchQueryCache } from './transcriptSearchQueryCache.js'
import {
  disarmVirtualMessageListSearch,
  setVirtualMessageListSearchQuery,
  stepVirtualMessageListSearch,
  type VirtualMessageListSearchCursorState,
} from './virtualMessageListSearchJumpController.js'

function ref<T>(current: T): { current: T } {
  return { current }
}

function textOf(message: ReturnType<typeof createUserMessage>): string {
  return getContentText(message.message.content)?.toLowerCase() ?? ''
}

describe('virtualMessageListSearchJumpController', () => {
  it('queues the latest step while a seek is already in flight', () => {
    const pendingStepRef = ref<1 | -1 | 0>(0)

    stepVirtualMessageListSearch({
      delta: -1,
      searchStateRef: ref<VirtualMessageListSearchCursorState>({
        matches: [1],
        ptr: 0,
        screenOrd: 0,
        prefixSum: [0, 1],
      }),
      scanRequestRef: ref({ idx: 1, wantLast: false, tries: 0 }),
      pendingStepRef,
      startPtrRef: ref(-1),
      elementPositionsRef: ref({ msgIdx: 1, positions: [] }),
      highlight: mock(() => {}),
      jump: mock(() => {}),
    })

    expect(pendingStepRef.current).toBe(-1)
  })

  it('highlights the next visible occurrence before jumping to another message', () => {
    const highlight = mock(() => {})
    const searchStateRef = ref<VirtualMessageListSearchCursorState>({
      matches: [3, 7],
      ptr: 0,
      screenOrd: 0,
      prefixSum: [0, 2, 5],
    })
    const startPtrRef = ref(-1)

    stepVirtualMessageListSearch({
      delta: 1,
      searchStateRef,
      scanRequestRef: ref(null),
      pendingStepRef: ref<1 | -1 | 0>(0),
      startPtrRef,
      elementPositionsRef: ref({
        msgIdx: 3,
        positions: [
          { row: 1, col: 0, len: 2 },
          { row: 3, col: 1, len: 2 },
        ],
      }),
      highlight,
      jump: mock(() => {}),
    })

    expect(searchStateRef.current.screenOrd).toBe(1)
    expect(startPtrRef.current).toBe(-1)
    expect(highlight).toHaveBeenCalledWith(1)
  })

  it('jumps to the next matched message and updates the placeholder badge when visible matches are exhausted', () => {
    const jump = mock(() => {})
    const onSearchMatchesChange = mock(() => {})
    const searchStateRef = ref<VirtualMessageListSearchCursorState>({
      matches: [3, 7],
      ptr: 0,
      screenOrd: 0,
      prefixSum: [0, 2, 5],
    })

    stepVirtualMessageListSearch({
      delta: 1,
      searchStateRef,
      scanRequestRef: ref(null),
      pendingStepRef: ref<1 | -1 | 0>(0),
      startPtrRef: ref(-1),
      elementPositionsRef: ref({
        msgIdx: 3,
        positions: [{ row: 1, col: 0, len: 2 }],
      }),
      highlight: mock(() => {}),
      jump,
      onSearchMatchesChange,
    })

    expect(searchStateRef.current.ptr).toBe(1)
    expect(searchStateRef.current.screenOrd).toBe(0)
    expect(jump).toHaveBeenCalledWith(7, false)
    expect(onSearchMatchesChange).toHaveBeenCalledWith(5, 3)
  })

  it('resolves a new query, clears stale positions, and jumps to the nearest match', () => {
    const messages = [
      createUserMessage({ content: 'alpha' }),
      createUserMessage({ content: 'assistant beta' }),
      createUserMessage({ content: 'gamma' }),
    ]
    const jump = mock(() => {})
    const setPositions = mock(() => {})
    const onSearchMatchesChange = mock(() => {})
    const scrollTo = mock(() => {})
    const searchStateRef = ref<VirtualMessageListSearchCursorState>({
      matches: [],
      ptr: 0,
      screenOrd: 0,
      prefixSum: [],
    })
    const scanRequestRef = ref({
      idx: 9,
      wantLast: false,
      tries: 1,
    })
    const elementPositionsRef = ref({
      msgIdx: 9,
      positions: [{ row: 8, col: 0, len: 1 }],
    })
    const startPtrRef = ref(4)
    const searchAnchorRef = ref(-1)

    setVirtualMessageListSearchQuery({
      query: 'assistant',
      messages,
      extractSearchText: textOf,
      searchQueryCache: createTranscriptSearchQueryCache(),
      searchStateRef,
      scanRequestRef,
      elementPositionsRef,
      startPtrRef,
      searchAnchorRef,
      scrollBox: {
        getScrollTop: () => 12,
        scrollTo,
      },
      offsets: new Float64Array([0, 10, 20]),
      start: 0,
      getItemTop: index => index * 10,
      findNearestMatchPointer: () => 0,
      jump,
      setPositions,
      onSearchMatchesChange,
      logDebug: mock(() => {}),
    })

    expect(scanRequestRef.current).toBeNull()
    expect(elementPositionsRef.current).toEqual({ msgIdx: -1, positions: [] })
    expect(startPtrRef.current).toBe(-1)
    expect(searchStateRef.current.matches).toEqual([1])
    expect(jump).toHaveBeenCalledWith(1, true)
    expect(scrollTo).not.toHaveBeenCalled()
    expect(setPositions).toHaveBeenCalledWith(null)
    expect(onSearchMatchesChange).toHaveBeenCalledWith(1, 1)
  })

  it('restores the anchor scroll position when a new query has no matches', () => {
    const scrollTo = mock(() => {})
    const searchStateRef = ref<VirtualMessageListSearchCursorState>({
      matches: [0],
      ptr: 0,
      screenOrd: 0,
      prefixSum: [0, 1],
    })

    setVirtualMessageListSearchQuery({
      query: 'zzz',
      messages: [
        createUserMessage({ content: 'alpha' }),
        createUserMessage({ content: 'beta' }),
      ],
      extractSearchText: textOf,
      searchQueryCache: createTranscriptSearchQueryCache(),
      searchStateRef,
      scanRequestRef: ref(null),
      elementPositionsRef: ref({ msgIdx: -1, positions: [] }),
      startPtrRef: ref(-1),
      searchAnchorRef: ref(77),
      scrollBox: {
        getScrollTop: () => 15,
        scrollTo,
      },
      offsets: new Float64Array([0, 10]),
      start: 0,
      getItemTop: index => index * 10,
      findNearestMatchPointer: () => 0,
      jump: mock(() => {}),
      onSearchMatchesChange: mock(() => {}),
    })

    expect(searchStateRef.current.matches).toEqual([])
    expect(scrollTo).toHaveBeenCalledWith(77)
  })

  it('disarms the active search overlay state on manual scroll', () => {
    const setPositions = mock(() => {})
    const scanRequestRef = ref({
      idx: 2,
      wantLast: false,
      tries: 0,
    })
    const elementPositionsRef = ref({
      msgIdx: 2,
      positions: [{ row: 4, col: 0, len: 2 }],
    })
    const startPtrRef = ref(5)

    disarmVirtualMessageListSearch({
      setPositions,
      scanRequestRef,
      elementPositionsRef,
      startPtrRef,
    })

    expect(setPositions).toHaveBeenCalledWith(null)
    expect(scanRequestRef.current).toBeNull()
    expect(elementPositionsRef.current).toEqual({ msgIdx: -1, positions: [] })
    expect(startPtrRef.current).toBe(-1)
  })
})
