import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import { registerCleanup } from './cleanupRegistry.js'
import { logForDebugging } from './debug.js'

const CHECK_INTERVAL_MS = 100
const STALL_THRESHOLD_MS = 500
const LOG_THROTTLE_MS = 30_000

let started = false
let cleanupRegistered = false
let interval: NodeJS.Timeout | null = null

export function startEventLoopStallDetector(): void {
  if (started) {
    return
  }

  started = true
  let expectedAt = performance.now() + CHECK_INTERVAL_MS
  let lastLoggedAt = 0

  interval = setInterval(() => {
    const now = performance.now()
    const lagMs = Math.max(0, now - expectedAt)
    expectedAt = now + CHECK_INTERVAL_MS

    if (lagMs <= STALL_THRESHOLD_MS) {
      return
    }

    if (now - lastLoggedAt < LOG_THROTTLE_MS) {
      return
    }

    lastLoggedAt = now
    const roundedLag = Math.round(lagMs)

    logForDebugging(
      `[Perf] Event loop stall detected: ${roundedLag}ms main-thread pause`,
      { level: 'warn' },
    )
    logEvent('ncode_event_loop_stall', {
      stall_ms:
        roundedLag as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
  }, CHECK_INTERVAL_MS)

  interval.unref?.()

  if (!cleanupRegistered) {
    cleanupRegistered = true
    registerCleanup(async () => {
      if (interval) {
        clearInterval(interval)
        interval = null
      }
      started = false
    })
  }
}
