import { registerCleanup } from './cleanupRegistry.js'
import { logForDebugging } from './debug.js'
import { performHeapDump } from './heapDumpService.js'

const RSS_THRESHOLD_BYTES = Math.floor(1.5 * 1024 * 1024 * 1024)
const CHECK_INTERVAL_MS = 30_000
const DUMP_COOLDOWN_MS = 10 * 60 * 1000
const MAX_AUTO_DUMPS_PER_SESSION = 3

let started = false
let cleanupRegistered = false
let interval: NodeJS.Timeout | null = null

function formatGigabytes(bytes: number): string {
  return (bytes / 1024 / 1024 / 1024).toFixed(3)
}

export function startSdkMemoryMonitor(): void {
  if (started) {
    return
  }

  started = true
  let dumpCount = 0
  let lastDumpAt = 0
  let inFlight = false

  interval = setInterval(() => {
    if (inFlight || dumpCount >= MAX_AUTO_DUMPS_PER_SESSION) {
      return
    }

    const rss = process.memoryUsage().rss
    if (rss < RSS_THRESHOLD_BYTES) {
      return
    }

    const now = Date.now()
    if (now - lastDumpAt < DUMP_COOLDOWN_MS) {
      return
    }

    dumpCount += 1
    const dumpNumber = dumpCount
    lastDumpAt = now
    inFlight = true

    logForDebugging(
      `[HeapDump] RSS ${formatGigabytes(rss)} GB exceeded 1.5 GB threshold; capturing auto heap dump #${dumpNumber}`,
      { level: 'warn' },
    )

    void performHeapDump('auto-1.5GB', dumpNumber)
      .then(result => {
        if (!result.success) {
          logForDebugging(
            `[HeapDump] Auto heap dump #${dumpNumber} failed: ${result.error ?? 'unknown error'}`,
            { level: 'error' },
          )
        }
      })
      .catch(error => {
        logForDebugging(
          `[HeapDump] Auto heap dump #${dumpNumber} threw: ${String(error)}`,
          { level: 'error' },
        )
      })
      .finally(() => {
        inFlight = false
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
