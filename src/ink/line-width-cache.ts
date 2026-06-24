import { stringWidth } from './stringWidth.js'

// During streaming, text grows but completed lines are immutable.
// Caching stringWidth per-line avoids re-measuring hundreds of
// unchanged lines on every token (~50x reduction in stringWidth calls).
const cache = new Map<string, number>()

const MAX_CACHE_SIZE = 4096

export function lineWidth(line: string): number {
  const cached = cache.get(line)
  if (cached !== undefined) return cached

  const width = stringWidth(line)

  // Evict oldest 25% when cache grows too large. Full clear would force
  // re-measuring every visible line on the next frame.
  if (cache.size >= MAX_CACHE_SIZE) {
    const evictCount = Math.floor(cache.size * 0.25)
    let evicted = 0
    for (const key of cache.keys()) {
      cache.delete(key)
      if (++evicted >= evictCount) break
    }
  }

  cache.set(line, width)
  return width
}
