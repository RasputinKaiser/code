export type TranscriptSearchQueryState = {
  query: string
  matches: number[]
  prefixSum: number[]
  messageCount: number
}

export type TranscriptSearchQueryCache = Map<string, TranscriptSearchQueryState>

type ResolveTranscriptSearchQueryArgs = {
  cache: TranscriptSearchQueryCache
  query: string
  messageCount: number
  getSearchText: (index: number) => string
}

const EMPTY_QUERY_STATE: TranscriptSearchQueryState = {
  query: '',
  matches: [],
  prefixSum: [0],
  messageCount: 0,
}

const MAX_CACHED_QUERIES = 64

export function createTranscriptSearchQueryCache(): TranscriptSearchQueryCache {
  return new Map()
}

export function resolveTranscriptSearchQueryState({
  cache,
  query,
  messageCount,
  getSearchText,
}: ResolveTranscriptSearchQueryArgs): TranscriptSearchQueryState {
  const loweredQuery = query.toLowerCase()
  if (!loweredQuery) {
    return EMPTY_QUERY_STATE
  }

  const cached = cache.get(loweredQuery)
  if (cached) {
    if (cached.messageCount === messageCount) {
      promoteCachedQuery(cache, loweredQuery, cached)
      return cached
    }

    if (cached.messageCount < messageCount) {
      const extended = extendQueryState(
        cached,
        cached.messageCount,
        messageCount,
        getSearchText,
      )
      cacheQueryState(cache, extended)
      return extended
    }

    // messageCount shrank or corpus was replaced; drop stale cache entry.
    cache.delete(loweredQuery)
  }

  const seed = findLongestCachedPrefix(cache, loweredQuery, messageCount)
  const candidateIndices = seed?.matches
  const matches: number[] = []
  const prefixSum: number[] = [0]

  if (candidateIndices) {
    for (const idx of candidateIndices) {
      const count = countOccurrences(getSearchText(idx), loweredQuery)
      if (count > 0) {
        matches.push(idx)
        prefixSum.push(prefixSum[prefixSum.length - 1]! + count)
      }
    }
  } else {
    for (let idx = 0; idx < messageCount; idx += 1) {
      const count = countOccurrences(getSearchText(idx), loweredQuery)
      if (count > 0) {
        matches.push(idx)
        prefixSum.push(prefixSum[prefixSum.length - 1]! + count)
      }
    }
  }

  const nextState: TranscriptSearchQueryState = {
    query: loweredQuery,
    matches,
    prefixSum,
    messageCount,
  }
  cacheQueryState(cache, nextState)
  return nextState
}

type ExtendTranscriptSearchQueryCacheArgs = {
  cache: TranscriptSearchQueryCache
  fromIndex: number
  toIndex: number
  getSearchText: (index: number) => string
}

export function extendTranscriptSearchQueryCache({
  cache,
  fromIndex,
  toIndex,
  getSearchText,
}: ExtendTranscriptSearchQueryCacheArgs): void {
  if (toIndex <= fromIndex || cache.size === 0) {
    return
  }

  for (const [query, state] of cache) {
    if (state.messageCount >= toIndex) {
      continue
    }
    const extendFrom = Math.max(fromIndex, state.messageCount)
    const extended = extendQueryState(state, extendFrom, toIndex, getSearchText)
    cache.set(query, extended)
  }
}

function countOccurrences(text: string, query: string): number {
  let pos = text.indexOf(query)
  let count = 0
  while (pos >= 0) {
    count += 1
    pos = text.indexOf(query, pos + query.length)
  }
  return count
}

function findLongestCachedPrefix(
  cache: TranscriptSearchQueryCache,
  query: string,
  messageCount: number,
): TranscriptSearchQueryState | null {
  let best: TranscriptSearchQueryState | null = null
  for (const [cachedQuery, state] of cache) {
    if (
      state.messageCount === messageCount &&
      cachedQuery.length > 0 &&
      cachedQuery.length < query.length &&
      query.startsWith(cachedQuery) &&
      (!best || cachedQuery.length > best.query.length)
    ) {
      best = state
    }
  }
  return best
}

function extendQueryState(
  state: TranscriptSearchQueryState,
  fromIndex: number,
  toIndex: number,
  getSearchText: (index: number) => string,
): TranscriptSearchQueryState {
  if (toIndex <= fromIndex) {
    return state.messageCount === toIndex
      ? state
      : { ...state, messageCount: toIndex }
  }

  const matches = [...state.matches]
  const prefixSum = [...state.prefixSum]
  for (let idx = fromIndex; idx < toIndex; idx += 1) {
    const count = countOccurrences(getSearchText(idx), state.query)
    if (count > 0) {
      matches.push(idx)
      prefixSum.push(prefixSum[prefixSum.length - 1]! + count)
    }
  }

  return {
    ...state,
    matches,
    prefixSum,
    messageCount: toIndex,
  }
}

function cacheQueryState(
  cache: TranscriptSearchQueryCache,
  state: TranscriptSearchQueryState,
): void {
  cache.delete(state.query)
  cache.set(state.query, state)
  while (cache.size > MAX_CACHED_QUERIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) {
      break
    }
    cache.delete(oldest)
  }
}

function promoteCachedQuery(
  cache: TranscriptSearchQueryCache,
  query: string,
  state: TranscriptSearchQueryState,
): void {
  cache.delete(query)
  cache.set(query, state)
}
