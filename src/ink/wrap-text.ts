import sliceAnsi from '../utils/sliceAnsi.js'
import { LRUCache } from 'lru-cache'
import { stringWidth } from './stringWidth.js'
import type { Styles } from './styles.js'
import { wrapAnsi } from './wrapAnsi.js'

const ELLIPSIS = '…'

// Cache wrap results to avoid re-computing ANSI-aware wrapping for static text
// nodes on every render pass. Marginal cost is low for short strings, but
// long code blocks and multi-line tool results repeat wrapAnsi work every
// frame during scroll or streaming. LRU prevents unbounded growth.
const MAX_WRAP_CACHE_ENTRIES = 512
const MAX_CACHEABLE_TEXT_LENGTH = 64 * 1024
const wrapCache = new LRUCache<string, string>({ max: MAX_WRAP_CACHE_ENTRIES })

function wrapCacheKey(text: string, maxWidth: number, wrapType: Styles['textWrap']): string {
  return `${wrapType ?? 'wrap'}:${maxWidth}:${text}`
}

// sliceAnsi may include a boundary-spanning wide char (e.g. CJK at position
// end-1 with width 2 overshoots by 1). Retry with a tighter bound once.
function sliceFit(text: string, start: number, end: number): string {
  const s = sliceAnsi(text, start, end)
  return stringWidth(s) > end - start ? sliceAnsi(text, start, end - 1) : s
}

function truncate(
  text: string,
  columns: number,
  position: 'start' | 'middle' | 'end',
): string {
  if (columns < 1) return ''
  if (columns === 1) return ELLIPSIS

  const length = stringWidth(text)
  if (length <= columns) return text

  if (position === 'start') {
    return ELLIPSIS + sliceFit(text, length - columns + 1, length)
  }
  if (position === 'middle') {
    const half = Math.floor(columns / 2)
    return (
      sliceFit(text, 0, half) +
      ELLIPSIS +
      sliceFit(text, length - (columns - half) + 1, length)
    )
  }
  return sliceFit(text, 0, columns - 1) + ELLIPSIS
}

export default function wrapText(
  text: string,
  maxWidth: number,
  wrapType: Styles['textWrap'],
): string {
  if (text.length <= MAX_CACHEABLE_TEXT_LENGTH) {
    const key = wrapCacheKey(text, maxWidth, wrapType)
    const cached = wrapCache.get(key)
    if (cached !== undefined) return cached

    const result = computeWrap(text, maxWidth, wrapType)
    wrapCache.set(key, result)
    return result
  }

  return computeWrap(text, maxWidth, wrapType)
}

function computeWrap(
  text: string,
  maxWidth: number,
  wrapType: Styles['textWrap'],
): string {
  if (wrapType === 'wrap') {
    return wrapAnsi(text, maxWidth, {
      trim: false,
      hard: true,
    })
  }

  if (wrapType === 'wrap-trim') {
    return wrapAnsi(text, maxWidth, {
      trim: true,
      hard: true,
    })
  }

  if (wrapType!.startsWith('truncate')) {
    let position: 'end' | 'middle' | 'start' = 'end'

    if (wrapType === 'truncate-middle') {
      position = 'middle'
    }

    if (wrapType === 'truncate-start') {
      position = 'start'
    }

    return truncate(text, maxWidth, position)
  }

  return text
}

export function resetWrapTextCacheForTesting(): void {
  wrapCache.clear()
}

export function getWrapTextCacheStatsForTesting(): {
  entries: number
} {
  return {
    entries: wrapCache.size,
  }
}
