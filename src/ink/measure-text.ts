import { lineWidth } from './line-width-cache.js'

type Output = {
  width: number
  height: number
}

// Long-history transcript entry remounts the same visible heavy code/file
// blocks when switching modes. lineWidth() already caches per-line widths,
// but measureText() still rescans every line to rebuild total width/height.
// A small bounded cache keeps those repeated width/height tuples hot across
// prompt->transcript remounts without retaining unbounded transcript text.
const measureCache = new Map<number, Map<string, Output>>()
let measureCacheSize = 0
let measureCacheBytes = 0
const MAX_MEASURE_CACHE_SIZE = 512
const MAX_MEASURE_CACHE_BYTES = 2 * 1024 * 1024
const MAX_CACHEABLE_TEXT_LENGTH = 64 * 1024

function estimatedMeasureEntryBytes(text: string): number {
  return text.length * 2 + 32
}

function evictMeasureCacheIfNeeded(): void {
  while (
    measureCacheSize > MAX_MEASURE_CACHE_SIZE ||
    measureCacheBytes > MAX_MEASURE_CACHE_BYTES
  ) {
    const widthEntry = measureCache.entries().next().value as
      | [number, Map<string, Output>]
      | undefined
    if (!widthEntry) {
      measureCacheSize = 0
      measureCacheBytes = 0
      return
    }
    const [maxWidth, widthCache] = widthEntry
    const text = widthCache.keys().next().value as string | undefined
    if (text === undefined) {
      measureCache.delete(maxWidth)
      continue
    }
    widthCache.delete(text)
    measureCacheSize--
    measureCacheBytes -= estimatedMeasureEntryBytes(text)
    if (widthCache.size === 0) {
      measureCache.delete(maxWidth)
    }
  }
}

export function resetMeasureTextCacheForTesting(): void {
  measureCache.clear()
  measureCacheSize = 0
  measureCacheBytes = 0
}

export function getMeasureTextCacheStatsForTesting(): {
  entries: number
  bytes: number
} {
  return {
    entries: measureCacheSize,
    bytes: measureCacheBytes,
  }
}

// Single-pass measurement: computes both width and height in one
// iteration instead of two (widestLine + countVisualLines).
// Uses indexOf to avoid array allocation from split('\n').
function measureText(text: string, maxWidth: number): Output {
  if (text.length === 0) {
    return {
      width: 0,
      height: 0,
    }
  }

  const widthCache = measureCache.get(maxWidth)
  const cached = widthCache?.get(text)
  if (cached) {
    return cached
  }

  // Infinite or non-positive width means no wrapping — each line is one visual line.
  // Must check before the loop since Math.ceil(w / Infinity) = 0.
  const noWrap = maxWidth <= 0 || !Number.isFinite(maxWidth)

  let height = 0
  let width = 0
  let start = 0

  while (start <= text.length) {
    const end = text.indexOf('\n', start)
    const line = end === -1 ? text.substring(start) : text.substring(start, end)

    const w = lineWidth(line)
    width = Math.max(width, w)

    if (noWrap) {
      height++
    } else {
      height += w === 0 ? 1 : Math.ceil(w / maxWidth)
    }

    if (end === -1) break
    start = end + 1
  }

  const output = { width, height }

  if (text.length > MAX_CACHEABLE_TEXT_LENGTH) {
    return output
  }

  let nextWidthCache = widthCache
  if (!nextWidthCache) {
    nextWidthCache = new Map<string, Output>()
    measureCache.set(maxWidth, nextWidthCache)
  }
  if (!nextWidthCache.has(text)) {
    measureCacheSize++
    measureCacheBytes += estimatedMeasureEntryBytes(text)
  }
  nextWidthCache.set(text, output)
  evictMeasureCacheIfNeeded()

  return output
}

export default measureText
