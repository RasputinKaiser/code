import type { SessionLifecycle } from './sessionLifecycle.js'
import { shouldRunStartupPrefetch } from './startupPrefetchPolicy.js'

export type StartupPrefetchDeps = {
  checkQuotaStatus: () => Promise<void>
  prefetchPassesEligibility: () => void
  fetchBootstrapData: () => void
  prefetchFastModeStatus: () => void
  resolveFastModeStatusFromCache: () => void
  refreshExampleCommands: () => void
  logForDebugging: (msg: string) => void
  logError: (error: unknown) => void
  getFeatureValue: <T>(key: string, fallback: T) => T
  getGlobalConfig: () => { startupPrefetchedAt?: number }
  saveGlobalConfig: (
    updater: (c: { startupPrefetchedAt?: number }) => {
      startupPrefetchedAt?: number
    },
  ) => void
  isBareMode: () => boolean
  now: () => number
}

/**
 * Run the startup prefetch ladder according to the current session lifecycle.
 *
 * This is the single integration point between main.tsx and the policy table.
 * Every warm is gated by `shouldRunStartupPrefetch`, which reads the policy
 * table in `startupPrefetchPolicy.ts`.
 */
export function runStartupPrefetches(
  lifecycle: SessionLifecycle,
  deps: StartupPrefetchDeps,
): void {
  const {
    checkQuotaStatus,
    prefetchPassesEligibility,
    fetchBootstrapData,
    prefetchFastModeStatus,
    resolveFastModeStatusFromCache,
    refreshExampleCommands,
    logForDebugging,
    logError,
    getFeatureValue,
    getGlobalConfig,
    saveGlobalConfig,
    isBareMode,
    now,
  } = deps

  const bgRefreshThrottleMs = getFeatureValue('ncode_cicada_nap_ms', 0)
  const lastPrefetched = getGlobalConfig().startupPrefetchedAt ?? 0
  const skipStartupPrefetches =
    isBareMode() ||
    (bgRefreshThrottleMs > 0 && now() - lastPrefetched < bgRefreshThrottleMs)

  if (!skipStartupPrefetches) {
    const lastPrefetchedInfo =
      lastPrefetched > 0
        ? ` last ran ${Math.round((now() - lastPrefetched) / 1000)}s ago`
        : ''
    logForDebugging(`Starting background startup prefetches${lastPrefetchedInfo}`)

    if (shouldRunStartupPrefetch(lifecycle, 'quota')) {
      checkQuotaStatus().catch(error => logError(error))
    }
    if (shouldRunStartupPrefetch(lifecycle, 'passes')) {
      void prefetchPassesEligibility()
    }
    if (shouldRunStartupPrefetch(lifecycle, 'bootstrap')) {
      void fetchBootstrapData()
    }
    if (shouldRunStartupPrefetch(lifecycle, 'fastMode')) {
      if (!getFeatureValue('ncode_miraculo_the_bard', false)) {
        void prefetchFastModeStatus()
      } else {
        // Kill switch skips the network call, not org-policy enforcement.
        resolveFastModeStatusFromCache()
      }
    }

    if (bgRefreshThrottleMs > 0) {
      saveGlobalConfig(current => ({
        ...current,
        startupPrefetchedAt: now(),
      }))
    }
  } else {
    logForDebugging(
      `Skipping startup prefetches, last ran ${Math.round((now() - lastPrefetched) / 1000)}s ago`,
    )
    if (shouldRunStartupPrefetch(lifecycle, 'fastMode')) {
      resolveFastModeStatusFromCache()
    }
  }

  if (shouldRunStartupPrefetch(lifecycle, 'exampleCommands')) {
    void refreshExampleCommands()
  }
}
