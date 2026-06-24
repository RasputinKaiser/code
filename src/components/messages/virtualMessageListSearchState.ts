import {
  resolveTranscriptSearchQueryState,
  type TranscriptSearchQueryCache,
  type TranscriptSearchQueryState,
} from './transcriptSearchQueryCache.js'

export type FindNearestMatchPointerArgs = {
  matches: number[]
  offsets: Float64Array
  origin: number
  targetTop: number
}

type ResolveVirtualMessageListSearchStateArgs = {
  cache: TranscriptSearchQueryCache
  query: string
  messageCount: number
  getSearchText: (index: number) => string
  searchAnchorTop: number
  currentScrollTop: number | null
  offsets: Float64Array
  origin: number
  findNearestMatchPointer: (args: FindNearestMatchPointerArgs) => number
}

export type VirtualMessageListSearchResolution = {
  state: TranscriptSearchQueryState & { ptr: number; screenOrd: number }
  total: number
  placeholderCurrent: number
  jumpIndex: number | null
  restoreScrollTop: number | null
}

function searchMatchTop(
  { matches, offsets, origin }: Omit<FindNearestMatchPointerArgs, 'targetTop'>,
  matchPtr: number,
): number {
  return origin + offsets[matches[matchPtr]!]!
}

export function findNearestSearchMatchPointer({
  matches,
  offsets,
  origin,
  targetTop,
}: FindNearestMatchPointerArgs): number {
  if (matches.length === 0) {
    return 0
  }

  let lo = 0
  let hi = matches.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (searchMatchTop({ matches, offsets, origin }, mid) <= targetTop) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }

  const upper = lo
  const lower = upper - 1
  if (lower < 0) {
    return upper >= matches.length ? matches.length - 1 : upper
  }
  if (upper >= matches.length) {
    return lower
  }

  const lowerDistance = Math.abs(
    searchMatchTop({ matches, offsets, origin }, lower) - targetTop,
  )
  const upperDistance = Math.abs(
    searchMatchTop({ matches, offsets, origin }, upper) - targetTop,
  )
  return upperDistance <= lowerDistance ? upper : lower
}

export function resolveVirtualMessageListSearchState({
  cache,
  query,
  messageCount,
  getSearchText,
  searchAnchorTop,
  currentScrollTop,
  offsets,
  origin,
  findNearestMatchPointer,
}: ResolveVirtualMessageListSearchStateArgs): VirtualMessageListSearchResolution {
  const loweredQuery = query.toLowerCase()
  const { matches, prefixSum } = resolveTranscriptSearchQueryState({
    cache,
    query: loweredQuery,
    messageCount,
    getSearchText,
  })
  const total = prefixSum.at(-1) ?? 0

  let ptr = 0
  if (matches.length > 0 && currentScrollTop !== null) {
    const targetTop = searchAnchorTop >= 0 ? searchAnchorTop : currentScrollTop
    ptr = findNearestMatchPointer({
      matches,
      offsets,
      origin,
      targetTop,
    })
  }

  return {
    state: {
      query: loweredQuery,
      matches,
      prefixSum,
      messageCount,
      ptr,
      screenOrd: 0,
    },
    total,
    placeholderCurrent: matches.length > 0 ? prefixSum[ptr + 1] ?? total : 0,
    jumpIndex: matches.length > 0 ? matches[ptr]! : null,
    restoreScrollTop:
      matches.length === 0 && searchAnchorTop >= 0 ? searchAnchorTop : null,
  }
}
