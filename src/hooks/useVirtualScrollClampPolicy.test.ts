import { describe, expect, it } from 'bun:test'
import {
  computeVirtualScrollClampBounds,
  computeVirtualScrollRenderPolicy,
  resolveVirtualScrollClampBounds,
  resolveVirtualScrollCoverageHeight,
} from './useVirtualScroll.js'

describe('resolveVirtualScrollCoverageHeight', () => {
  it('prefers measured height, then estimate, then pessimistic fallback', () => {
    expect(
      resolveVirtualScrollCoverageHeight({
        cachedHeight: 12,
        estimatedHeight: 30,
      }),
    ).toBe(12)
    expect(
      resolveVirtualScrollCoverageHeight({
        cachedHeight: undefined,
        estimatedHeight: 30,
      }),
    ).toBe(30)
    expect(
      resolveVirtualScrollCoverageHeight({
        cachedHeight: undefined,
        estimatedHeight: undefined,
      }),
    ).toBe(1)
  })

  it('normalizes invalid or non-positive estimates to the pessimistic fallback', () => {
    expect(
      resolveVirtualScrollCoverageHeight({
        cachedHeight: undefined,
        estimatedHeight: 0,
      }),
    ).toBe(1)
    expect(
      resolveVirtualScrollCoverageHeight({
        cachedHeight: undefined,
        estimatedHeight: Number.POSITIVE_INFINITY,
      }),
    ).toBe(1)
  })
})

describe('computeVirtualScrollRenderPolicy', () => {
  it('uses the deferred mounted window for clamp bounds, not the immediate window', () => {
    const policy = computeVirtualScrollRenderPolicy({
      start: 1,
      end: 7,
      deferredStart: 3,
      deferredEnd: 5,
      pendingDelta: 0,
      isSticky: false,
      offsets: [0, 10, 20, 30, 40, 50, 60, 70, 80],
      viewportHeight: 15,
      listOrigin: 5,
      itemCount: 8,
      scrollTop: 36,
    })

    expect(policy.range).toEqual([3, 5])
    expect(policy.clampEnabled).toBe(true)
  })

  it('bypasses deferred end while scrolling down so tail content mounts immediately', () => {
    const policy = computeVirtualScrollRenderPolicy({
      start: 2,
      end: 7,
      deferredStart: 2,
      deferredEnd: 5,
      pendingDelta: 12,
      isSticky: false,
      offsets: [0, 10, 20, 30, 40, 50, 60, 70, 80],
      viewportHeight: 15,
      listOrigin: 5,
      itemCount: 8,
      scrollTop: 30,
    })

    expect(policy.range).toEqual([2, 7])
    expect(policy.clampEnabled).toBe(true)
  })

  it('bypasses deferral for one commit when sticky-bottom is first broken', () => {
    const policy = computeVirtualScrollRenderPolicy({
      start: 4,
      end: 12,
      deferredStart: 8,
      deferredEnd: 9,
      pendingDelta: -20,
      isSticky: false,
      brokeSticky: true,
      offsets: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120],
      viewportHeight: 20,
      listOrigin: 0,
      itemCount: 12,
      scrollTop: 70,
    })

    expect(policy.range).toEqual([4, 12])
    expect(policy.clampEnabled).toBe(true)
  })

  it('falls back to the immediate range when deferred intersection inverts', () => {
    const policy = computeVirtualScrollRenderPolicy({
      start: 6,
      end: 10,
      deferredStart: 9,
      deferredEnd: 5,
      pendingDelta: 0,
      isSticky: false,
      offsets: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120],
      viewportHeight: 20,
      listOrigin: 3,
      itemCount: 12,
      scrollTop: 73,
    })

    expect(policy.range).toEqual([6, 10])
    expect(policy.clampEnabled).toBe(true)
  })

  it('disables clamp while sticky or while the range is still settling', () => {
    const sticky = computeVirtualScrollRenderPolicy({
      start: 5,
      end: 12,
      deferredStart: 8,
      deferredEnd: 9,
      pendingDelta: 0,
      isSticky: true,
      offsets: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120],
      viewportHeight: 20,
      listOrigin: 4,
      itemCount: 12,
      scrollTop: 88,
    })
    const settling = computeVirtualScrollRenderPolicy({
      start: 2,
      end: 6,
      deferredStart: 3,
      deferredEnd: 5,
      pendingDelta: 0,
      isSticky: false,
      isRangeSettling: true,
      offsets: [0, 10, 20, 30, 40, 50, 60],
      viewportHeight: 15,
      listOrigin: 7,
      itemCount: 6,
      scrollTop: 24,
    })

    expect(sticky.range).toEqual([5, 12])
    expect(sticky.clampEnabled).toBe(false)
    expect(sticky.clampMin).toBeUndefined()
    expect(sticky.clampMax).toBeUndefined()

    expect(settling.range).toEqual([3, 5])
    expect(settling.clampEnabled).toBe(false)
  })

  it('trims oversized effective windows by viewport position, not scroll direction', () => {
    const offsets = Array.from({ length: 41 }, (_, index) => index * 10)

    const nearTop = computeVirtualScrollRenderPolicy({
      start: 0,
      end: 40,
      deferredStart: 0,
      deferredEnd: 40,
      pendingDelta: 0,
      isSticky: false,
      offsets,
      viewportHeight: 20,
      listOrigin: 0,
      itemCount: 40,
      scrollTop: 50,
      maxMountedItems: 10,
    })
    const nearBottom = computeVirtualScrollRenderPolicy({
      start: 0,
      end: 40,
      deferredStart: 0,
      deferredEnd: 40,
      pendingDelta: 0,
      isSticky: false,
      offsets,
      viewportHeight: 20,
      listOrigin: 0,
      itemCount: 40,
      scrollTop: 250,
      maxMountedItems: 10,
    })

    expect(nearTop.range).toEqual([0, 10])
    expect(nearTop.clampEnabled).toBe(true)

    expect(nearBottom.range).toEqual([30, 40])
    expect(nearBottom.clampEnabled).toBe(true)
  })
})

describe('computeVirtualScrollClampBounds', () => {
  it('computes clamp bounds from the live mounted slice, not estimate-space offsets', () => {
    const bounds = computeVirtualScrollClampBounds({
      clampEnabled: true,
      rangeStart: 3,
      rangeEnd: 5,
      itemCount: 8,
      viewportHeight: 15,
      mountedStartTop: 35,
      mountedEndBottom: 55,
    })

    expect(bounds).toEqual({
      clampMin: 35,
      clampMax: 40,
    })
  })

  it('allows pre-list content above the virtualized region when start is zero', () => {
    const bounds = computeVirtualScrollClampBounds({
      clampEnabled: true,
      rangeStart: 0,
      rangeEnd: 4,
      itemCount: 5,
      viewportHeight: 15,
      mountedStartTop: 12,
      mountedEndBottom: 52,
    })

    expect(bounds).toEqual({
      clampMin: 0,
      clampMax: 37,
    })
  })

  it('leaves the bottom unclamped at the true tail', () => {
    const bounds = computeVirtualScrollClampBounds({
      clampEnabled: true,
      rangeStart: 1,
      rangeEnd: 5,
      itemCount: 5,
      viewportHeight: 20,
      mountedStartTop: 17,
      mountedEndBottom: undefined,
    })

    expect(bounds).toEqual({
      clampMin: 17,
      clampMax: Infinity,
    })
  })

  it('disables clamp when live anchors are unavailable', () => {
    const startMissing = computeVirtualScrollClampBounds({
      clampEnabled: true,
      rangeStart: 2,
      rangeEnd: 5,
      itemCount: 8,
      viewportHeight: 15,
      mountedStartTop: undefined,
      mountedEndBottom: 65,
    })
    const endMissing = computeVirtualScrollClampBounds({
      clampEnabled: true,
      rangeStart: 0,
      rangeEnd: 4,
      itemCount: 8,
      viewportHeight: 15,
      mountedStartTop: 0,
      mountedEndBottom: undefined,
    })

    expect(startMissing).toEqual({
      clampMin: undefined,
      clampMax: undefined,
    })
    expect(endMissing).toEqual({
      clampMin: undefined,
      clampMax: undefined,
    })
  })
})

describe('resolveVirtualScrollClampBounds', () => {
  it('uses live clamp bounds immediately when they are available', () => {
    expect(
      resolveVirtualScrollClampBounds({
        clampEnabled: true,
        liveBounds: {
          clampMin: 35,
          clampMax: 40,
        },
        previousStableBounds: {
          clampMin: 20,
          clampMax: 25,
        },
        reusedPreviousBounds: true,
      }),
    ).toEqual({
      appliedBounds: {
        clampMin: 35,
        clampMax: 40,
      },
      nextStableBounds: {
        clampMin: 35,
        clampMax: 40,
      },
      reusedPreviousBounds: false,
    })
  })

  it('reuses the previous stable clamp for one commit when live anchors disappear transiently', () => {
    expect(
      resolveVirtualScrollClampBounds({
        clampEnabled: true,
        liveBounds: {
          clampMin: undefined,
          clampMax: undefined,
        },
        previousStableBounds: {
          clampMin: 35,
          clampMax: 40,
        },
        reusedPreviousBounds: false,
      }),
    ).toEqual({
      appliedBounds: {
        clampMin: 35,
        clampMax: 40,
      },
      nextStableBounds: {
        clampMin: 35,
        clampMax: 40,
      },
      reusedPreviousBounds: true,
    })
  })

  it('clears the clamp after a second consecutive missing-anchor commit', () => {
    expect(
      resolveVirtualScrollClampBounds({
        clampEnabled: true,
        liveBounds: {
          clampMin: undefined,
          clampMax: undefined,
        },
        previousStableBounds: {
          clampMin: 35,
          clampMax: 40,
        },
        reusedPreviousBounds: true,
      }),
    ).toEqual({
      appliedBounds: {
        clampMin: undefined,
        clampMax: undefined,
      },
      nextStableBounds: {
        clampMin: undefined,
        clampMax: undefined,
      },
      reusedPreviousBounds: false,
    })
  })

  it('clears both the applied and cached clamp when clamp is intentionally disabled', () => {
    expect(
      resolveVirtualScrollClampBounds({
        clampEnabled: false,
        liveBounds: {
          clampMin: 35,
          clampMax: 40,
        },
        previousStableBounds: {
          clampMin: 35,
          clampMax: 40,
        },
        reusedPreviousBounds: false,
      }),
    ).toEqual({
      appliedBounds: {
        clampMin: undefined,
        clampMax: undefined,
      },
      nextStableBounds: {
        clampMin: undefined,
        clampMax: undefined,
      },
      reusedPreviousBounds: false,
    })
  })
})
