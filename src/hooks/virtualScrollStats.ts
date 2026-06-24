export type VirtualScrollStatsSnapshot = {
  samples: number
  maxItemCount: number
  maxMountedCount: number
  maxMeasuredMountedCount: number
  maxUnmeasuredMountedCount: number
  maxHeightCacheSize: number
  maxMountedRefCount: number
  maxViewportHeight: number
  maxScrollTop: number
  maxTopSpacer: number
  maxBottomSpacer: number
  maxTotalHeight: number
  stickySamples: number
  clampEnabledSamples: number
}

export type VirtualScrollFrameStats = {
  itemCount: number
  mountedCount: number
  measuredMountedCount: number
  unmeasuredMountedCount: number
  heightCacheSize: number
  mountedRefCount: number
  viewportHeight: number
  scrollTop: number
  topSpacer: number
  bottomSpacer: number
  totalHeight: number
  isSticky: boolean
  clampEnabled: boolean
}

function zeroStats(): VirtualScrollStatsSnapshot {
  return {
    samples: 0,
    maxItemCount: 0,
    maxMountedCount: 0,
    maxMeasuredMountedCount: 0,
    maxUnmeasuredMountedCount: 0,
    maxHeightCacheSize: 0,
    maxMountedRefCount: 0,
    maxViewportHeight: 0,
    maxScrollTop: 0,
    maxTopSpacer: 0,
    maxBottomSpacer: 0,
    maxTotalHeight: 0,
    stickySamples: 0,
    clampEnabledSamples: 0,
  }
}

let stats = zeroStats()

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0
}

export function recordVirtualScrollFrameStats(
  frame: VirtualScrollFrameStats,
): void {
  stats.samples += 1
  stats.maxItemCount = Math.max(stats.maxItemCount, frame.itemCount)
  stats.maxMountedCount = Math.max(stats.maxMountedCount, frame.mountedCount)
  stats.maxMeasuredMountedCount = Math.max(
    stats.maxMeasuredMountedCount,
    frame.measuredMountedCount,
  )
  stats.maxUnmeasuredMountedCount = Math.max(
    stats.maxUnmeasuredMountedCount,
    frame.unmeasuredMountedCount,
  )
  stats.maxHeightCacheSize = Math.max(
    stats.maxHeightCacheSize,
    frame.heightCacheSize,
  )
  stats.maxMountedRefCount = Math.max(
    stats.maxMountedRefCount,
    frame.mountedRefCount,
  )
  stats.maxViewportHeight = Math.max(
    stats.maxViewportHeight,
    finite(frame.viewportHeight),
  )
  stats.maxScrollTop = Math.max(stats.maxScrollTop, finite(frame.scrollTop))
  stats.maxTopSpacer = Math.max(stats.maxTopSpacer, finite(frame.topSpacer))
  stats.maxBottomSpacer = Math.max(
    stats.maxBottomSpacer,
    finite(frame.bottomSpacer),
  )
  stats.maxTotalHeight = Math.max(stats.maxTotalHeight, finite(frame.totalHeight))
  if (frame.isSticky) stats.stickySamples += 1
  if (frame.clampEnabled) stats.clampEnabledSamples += 1
}

export function getVirtualScrollStatsSnapshot(): VirtualScrollStatsSnapshot {
  return { ...stats }
}

export function resetVirtualScrollStatsForTesting(): void {
  stats = zeroStats()
}
