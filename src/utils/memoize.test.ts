import { describe, expect, it } from 'bun:test'
import {
  memoizeAsyncWithLRU,
  memoizeWithLRU,
  memoizeWithTTL,
  memoizeWithTTLAsync,
} from './memoize.js'

describe('memoizeWithTTL', () => {
  it('caches results and returns stale while refreshing', async () => {
    let callCount = 0
    const fn = memoizeWithTTL((x: number) => {
      callCount++
      return x * 2
    }, 50)

    expect(fn(5)).toBe(10)
    expect(callCount).toBe(1)

    // Cache hit
    expect(fn(5)).toBe(10)
    expect(callCount).toBe(1)

    // Wait for TTL to expire
    await Bun.sleep(60)

    // Should return stale value and refresh in background
    expect(fn(5)).toBe(10)
    expect(callCount).toBe(1) // refresh is async

    // Give the microtask a chance to run
    await Bun.sleep(10)
    expect(callCount).toBe(2)

    // Now cache is fresh again
    expect(fn(5)).toBe(10)
    expect(callCount).toBe(2)
  })

  it('computes different keys for different args', () => {
    let callCount = 0
    const fn = memoizeWithTTL((x: number) => {
      callCount++
      return x * 2
    }, 5000)

    expect(fn(3)).toBe(6)
    expect(fn(4)).toBe(8)
    expect(callCount).toBe(2)
  })

  it('clears cache correctly', () => {
    let callCount = 0
    const fn = memoizeWithTTL(() => {
      callCount++
      return 42
    }, 5000)

    fn()
    fn.cache.clear()
    fn()
    expect(callCount).toBe(2)
  })
})

describe('memoizeWithTTLAsync', () => {
  it('deduplicates concurrent cold-miss calls', async () => {
    let callCount = 0
    const fn = memoizeWithTTLAsync(async (x: number) => {
      callCount++
      await Bun.sleep(20)
      return x * 2
    }, 50)

    const [a, b, c] = await Promise.all([fn(5), fn(5), fn(5)])
    expect(a).toBe(10)
    expect(b).toBe(10)
    expect(c).toBe(10)
    expect(callCount).toBe(1) // deduped
  })

  it('does not cache rejected promises', async () => {
    let callCount = 0
    const fn = memoizeWithTTLAsync(async () => {
      callCount++
      if (callCount === 1) {
        throw new Error('first failure')
      }
      return 'success'
    }, 5000)

    await expect(fn()).rejects.toThrow('first failure')
    const result = await fn()
    expect(result).toBe('success')
    expect(callCount).toBe(2)
  })

  it('refreshes stale cache in background', async () => {
    let callCount = 0
    const fn = memoizeWithTTLAsync(async () => {
      callCount++
      return callCount
    }, 50)

    expect(await fn()).toBe(1)
    await Bun.sleep(60)

    // Should return stale value and refresh
    expect(await fn()).toBe(1)
    await Bun.sleep(10)
    expect(callCount).toBe(2)
  })
})

describe('memoizeWithLRU', () => {
  it('caches results with LRU eviction', () => {
    let callCount = 0
    const fn = memoizeWithLRU(
      (x: number) => {
        callCount++
        return x * 2
      },
      (x) => String(x),
      3,
    )

    expect(fn(1)).toBe(2)
    expect(fn(2)).toBe(4)
    expect(fn(3)).toBe(6)
    expect(callCount).toBe(3)

    // Evict key 1
    expect(fn(4)).toBe(8)
    expect(callCount).toBe(4)

    // Key 1 was evicted, recompute
    expect(fn(1)).toBe(2)
    expect(callCount).toBe(5)

    // Key 2 was evicted in step 5 when 1 was re-inserted
    expect(fn(2)).toBe(4)
    expect(callCount).toBe(6)

    // Key 3 still cached? No, it was evicted at step 6 when 2 was inserted
    expect(fn(3)).toBe(6)
    expect(callCount).toBe(7)

    // Key 4 was evicted at step 7 when 3 was re-inserted
    expect(fn(4)).toBe(8)
    expect(callCount).toBe(8)
  })

  it('exposes cache management methods', () => {
    const fn = memoizeWithLRU(
      (x: number) => x * 2,
      (x) => String(x),
      10,
    )

    fn(5)
    expect(fn.cache.size()).toBe(1)
    expect(fn.cache.has('5')).toBe(true)
    expect(fn.cache.get('5')).toBe(10)

    fn.cache.delete('5')
    expect(fn.cache.has('5')).toBe(false)

    fn(1)
    fn(2)
    fn.cache.clear()
    expect(fn.cache.size()).toBe(0)
  })
})

describe('memoizeAsyncWithLRU', () => {
  it('caches successful results', async () => {
    let callCount = 0
    const fn = memoizeAsyncWithLRU(
      async (x: number) => {
        callCount++
        return x * 2
      },
      (x) => String(x),
      10,
      5000,
    )

    expect(await fn(5)).toBe(10)
    expect(await fn(5)).toBe(10)
    expect(callCount).toBe(1)
  })

  it('does not cache failures', async () => {
    let callCount = 0
    const fn = memoizeAsyncWithLRU(
      async () => {
        callCount++
        if (callCount === 1) {
          throw new Error('boom')
        }
        return 'ok'
      },
      () => 'key',
      10,
      5000,
    )

    await expect(fn()).rejects.toThrow('boom')
    const result = await fn()
    expect(result).toBe('ok')
    expect(callCount).toBe(2)
  })

  it('evicts stale entries after TTL', async () => {
    let callCount = 0
    const fn = memoizeAsyncWithLRU(
      async () => {
        callCount++
        return 'fresh'
      },
      () => 'key',
      10,
      50,
    )

    expect(await fn()).toBe('fresh')
    expect(callCount).toBe(1)

    await Bun.sleep(60)

    expect(await fn()).toBe('fresh')
    expect(callCount).toBe(2)
  })

  it('deduplicates concurrent in-flight requests', async () => {
    let callCount = 0
    const fn = memoizeAsyncWithLRU(
      async (x: number) => {
        callCount++
        await Bun.sleep(20)
        return x * 2
      },
      (x) => String(x),
      10,
      5000,
    )

    const [a, b] = await Promise.all([fn(5), fn(5)])
    expect(a).toBe(10)
    expect(b).toBe(10)
    expect(callCount).toBe(1)
  })

  it('clears cache and in-flight map', async () => {
    const fn = memoizeAsyncWithLRU(
      async () => 'result',
      () => 'key',
      10,
      5000,
    )

    await fn()
    expect(fn.cache.size()).toBe(1)
    fn.cache.clear()
    expect(fn.cache.size()).toBe(0)
    expect(fn.cache.has('key')).toBe(false)
  })
})
