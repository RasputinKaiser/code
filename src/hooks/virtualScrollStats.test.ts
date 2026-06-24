import { describe, expect, it } from 'bun:test'
import {
  getVirtualScrollStatsSnapshot,
  recordVirtualScrollFrameStats,
  resetVirtualScrollStatsForTesting,
} from './virtualScrollStats.js'

describe('virtual scroll stats', () => {
  it('records mount and cache high-water marks', () => {
    resetVirtualScrollStatsForTesting()

    recordVirtualScrollFrameStats({
      itemCount: 1000,
      mountedCount: 40,
      measuredMountedCount: 30,
      unmeasuredMountedCount: 10,
      heightCacheSize: 100,
      mountedRefCount: 35,
      viewportHeight: 24,
      scrollTop: 100,
      topSpacer: 200,
      bottomSpacer: 3000,
      totalHeight: 3224,
      isSticky: true,
      clampEnabled: false,
    })
    recordVirtualScrollFrameStats({
      itemCount: 1000,
      mountedCount: 55,
      measuredMountedCount: 50,
      unmeasuredMountedCount: 5,
      heightCacheSize: 150,
      mountedRefCount: 52,
      viewportHeight: 24,
      scrollTop: 150,
      topSpacer: 260,
      bottomSpacer: 2800,
      totalHeight: 3224,
      isSticky: false,
      clampEnabled: true,
    })

    expect(getVirtualScrollStatsSnapshot()).toEqual({
      samples: 2,
      maxItemCount: 1000,
      maxMountedCount: 55,
      maxMeasuredMountedCount: 50,
      maxUnmeasuredMountedCount: 10,
      maxHeightCacheSize: 150,
      maxMountedRefCount: 52,
      maxViewportHeight: 24,
      maxScrollTop: 150,
      maxTopSpacer: 260,
      maxBottomSpacer: 3000,
      maxTotalHeight: 3224,
      stickySamples: 1,
      clampEnabledSamples: 1,
    })
  })
})
