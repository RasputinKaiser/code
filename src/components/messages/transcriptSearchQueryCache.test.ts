import { describe, expect, it } from 'bun:test'
import {
  createTranscriptSearchQueryCache,
  extendTranscriptSearchQueryCache,
  resolveTranscriptSearchQueryState,
} from './transcriptSearchQueryCache.js'

describe('transcriptSearchQueryCache', () => {
  it('reuses the longest cached prefix when a query extends', () => {
    const texts = [
      'assistant assistant',
      'assistantship',
      'totally unrelated',
      'another assistant',
    ]
    const cache = createTranscriptSearchQueryCache()
    const calls = new Map<number, number>()
    const getSearchText = (index: number) => {
      calls.set(index, (calls.get(index) ?? 0) + 1)
      return texts[index]!
    }

    const initial = resolveTranscriptSearchQueryState({
      cache,
      query: 'assist',
      messageCount: texts.length,
      getSearchText,
    })
    expect(initial.matches).toEqual([0, 1, 3])
    expect(initial.prefixSum).toEqual([0, 2, 3, 4])
    expect(calls).toEqual(
      new Map([
        [0, 1],
        [1, 1],
        [2, 1],
        [3, 1],
      ]),
    )

    calls.clear()

    const narrowed = resolveTranscriptSearchQueryState({
      cache,
      query: 'assistant',
      messageCount: texts.length,
      getSearchText,
    })
    expect(narrowed.matches).toEqual([0, 1, 3])
    expect(narrowed.prefixSum).toEqual([0, 2, 3, 4])
    expect(calls).toEqual(
      new Map([
        [0, 1],
        [1, 1],
        [3, 1],
      ]),
    )
  })

  it('returns exact cached queries without rescanning texts', () => {
    const texts = [
      'assistant assistant',
      'assistantship',
      'totally unrelated',
      'another assistant',
    ]
    const cache = createTranscriptSearchQueryCache()
    let calls = 0
    const getSearchText = (index: number) => {
      calls += 1
      return texts[index]!
    }

    resolveTranscriptSearchQueryState({
      cache,
      query: 'assistan',
      messageCount: texts.length,
      getSearchText,
    })
    resolveTranscriptSearchQueryState({
      cache,
      query: 'assistant',
      messageCount: texts.length,
      getSearchText,
    })

    calls = 0

    const cached = resolveTranscriptSearchQueryState({
      cache,
      query: 'assistan',
      messageCount: texts.length,
      getSearchText,
    })
    expect(cached.matches).toEqual([0, 1, 3])
    expect(cached.prefixSum).toEqual([0, 2, 3, 4])
    expect(calls).toBe(0)
  })

  it('returns the empty query state without scanning', () => {
    const cache = createTranscriptSearchQueryCache()
    let calls = 0
    const result = resolveTranscriptSearchQueryState({
      cache,
      query: '',
      messageCount: 3,
      getSearchText: () => {
        calls += 1
        return 'unused'
      },
    })

    expect(result.matches).toEqual([])
    expect(result.prefixSum).toEqual([0])
    expect(calls).toBe(0)
  })

  it('extends an exact cached query when messageCount grows', () => {
    const texts = [
      'assistant alpha',
      'unrelated',
      'assistant beta',
      'assistant assistant',
    ]
    const cache = createTranscriptSearchQueryCache()
    const calls = new Map<number, number>()
    const getSearchText = (index: number) => {
      calls.set(index, (calls.get(index) ?? 0) + 1)
      return texts[index]!
    }

    const first = resolveTranscriptSearchQueryState({
      cache,
      query: 'assistant',
      messageCount: 2,
      getSearchText,
    })
    expect(first.matches).toEqual([0])
    expect(first.prefixSum).toEqual([0, 1])

    calls.clear()

    const second = resolveTranscriptSearchQueryState({
      cache,
      query: 'assistant',
      messageCount: 4,
      getSearchText,
    })
    expect(second.matches).toEqual([0, 2, 3])
    expect(second.prefixSum).toEqual([0, 1, 2, 4])
    expect(calls).toEqual(
      new Map([
        [2, 1],
        [3, 1],
      ]),
    )
  })

  it('extends all cached queries for append-only corpus updates', () => {
    const texts = [
      'assistant alpha',
      'beta',
      'assistant beta',
      'beta assistant',
    ]
    const cache = createTranscriptSearchQueryCache()
    const getSearchText = (index: number) => texts[index]!

    resolveTranscriptSearchQueryState({
      cache,
      query: 'assistant',
      messageCount: 2,
      getSearchText,
    })
    resolveTranscriptSearchQueryState({
      cache,
      query: 'beta',
      messageCount: 2,
      getSearchText,
    })

    extendTranscriptSearchQueryCache({
      cache,
      fromIndex: 2,
      toIndex: 4,
      getSearchText,
    })

    const assistant = resolveTranscriptSearchQueryState({
      cache,
      query: 'assistant',
      messageCount: 4,
      getSearchText,
    })
    const beta = resolveTranscriptSearchQueryState({
      cache,
      query: 'beta',
      messageCount: 4,
      getSearchText,
    })

    expect(assistant.matches).toEqual([0, 2, 3])
    expect(assistant.prefixSum).toEqual([0, 1, 2, 3])
    expect(beta.matches).toEqual([1, 2, 3])
    expect(beta.prefixSum).toEqual([0, 1, 2, 3])
  })
})
