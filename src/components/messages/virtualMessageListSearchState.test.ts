import { describe, expect, test } from 'bun:test'
import { createTranscriptSearchQueryCache } from './transcriptSearchQueryCache.js'
import { resolveVirtualMessageListSearchState } from './virtualMessageListSearchState.js'

describe('resolveVirtualMessageListSearchState', () => {
  test('uses the search anchor when selecting the nearest match pointer', () => {
    let seenTargetTop = -1
    const result = resolveVirtualMessageListSearchState({
      cache: createTranscriptSearchQueryCache(),
      query: 'match',
      messageCount: 3,
      getSearchText: index => ['nope', 'match', 'match again'][index]!,
      searchAnchorTop: 42,
      currentScrollTop: 7,
      offsets: new Float64Array([0, 10, 20]),
      origin: 0,
      findNearestMatchPointer: ({ targetTop }) => {
        seenTargetTop = targetTop
        return 1
      },
    })

    expect(seenTargetTop).toBe(42)
    expect(result.jumpIndex).toBe(2)
    expect(result.placeholderCurrent).toBe(2)
    expect(result.state.ptr).toBe(1)
  })

  test('restores the search anchor when there are no matches', () => {
    const result = resolveVirtualMessageListSearchState({
      cache: createTranscriptSearchQueryCache(),
      query: 'missing',
      messageCount: 2,
      getSearchText: index => ['alpha', 'beta'][index]!,
      searchAnchorTop: 128,
      currentScrollTop: 9,
      offsets: new Float64Array([0, 10]),
      origin: 0,
      findNearestMatchPointer: () => 0,
    })

    expect(result.jumpIndex).toBeNull()
    expect(result.placeholderCurrent).toBe(0)
    expect(result.restoreScrollTop).toBe(128)
  })
})
