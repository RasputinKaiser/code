import { describe, expect, it } from 'bun:test'
import { runStartupPrefetches, type StartupPrefetchDeps } from './startupPrefetch.js'

type CallLog = Record<string, number>

function makeFakeDeps(overrides?: Partial<StartupPrefetchDeps>): {
  calls: CallLog
  deps: StartupPrefetchDeps
} {
  const calls: CallLog = Object.create(null)
  const track = (name: string) => {
    calls[name] = (calls[name] ?? 0) + 1
  }

  const deps: StartupPrefetchDeps = {
    checkQuotaStatus: () => {
      track('checkQuotaStatus')
      return Promise.resolve()
    },
    prefetchPassesEligibility: () => track('prefetchPassesEligibility'),
    fetchBootstrapData: () => track('fetchBootstrapData'),
    prefetchFastModeStatus: () => track('prefetchFastModeStatus'),
    resolveFastModeStatusFromCache: () =>
      track('resolveFastModeStatusFromCache'),
    refreshExampleCommands: () => track('refreshExampleCommands'),
    logForDebugging: () => {},
    logError: () => {},
    getFeatureValue: (_key, fallback) => fallback,
    getGlobalConfig: () => ({}),
    saveGlobalConfig: () => {},
    isBareMode: () => false,
    now: () => Date.now(),
    ...overrides,
  }

  return { calls, deps }
}

describe('runStartupPrefetches lifecycle gating', () => {
  it('runs all local-interactive prefetches for local_interactive', () => {
    const { calls, deps } = makeFakeDeps()
    runStartupPrefetches('local_interactive', deps)

    expect(calls.checkQuotaStatus).toBe(1)
    expect(calls.prefetchPassesEligibility).toBe(1)
    expect(calls.fetchBootstrapData).toBe(1)
    expect(calls.prefetchFastModeStatus).toBe(1)
    expect(calls.resolveFastModeStatusFromCache).toBeUndefined()
    expect(calls.refreshExampleCommands).toBe(1)
  })

  it('runs only quota and passes for noninteractive', () => {
    const { calls, deps } = makeFakeDeps()
    runStartupPrefetches('noninteractive', deps)

    expect(calls.checkQuotaStatus).toBe(1)
    expect(calls.prefetchPassesEligibility).toBe(1)
    expect(calls.fetchBootstrapData).toBeUndefined()
    expect(calls.prefetchFastModeStatus).toBeUndefined()
    expect(calls.resolveFastModeStatusFromCache).toBeUndefined()
    expect(calls.refreshExampleCommands).toBeUndefined()
  })

  it('skips network prefetches for all remote-like modes', () => {
    const remoteModes = [
      'remote',
      'teleport',
      'ssh_remote',
      'direct_connect',
      'assistant',
    ] as const

    for (const mode of remoteModes) {
      const { calls, deps } = makeFakeDeps()
      runStartupPrefetches(mode, deps)

      expect(calls.checkQuotaStatus).toBeUndefined()
      expect(calls.prefetchPassesEligibility).toBeUndefined()
      expect(calls.fetchBootstrapData).toBeUndefined()
      expect(calls.prefetchFastModeStatus).toBeUndefined()
      expect(calls.refreshExampleCommands).toBeUndefined()
    }
  })

  it('uses cache resolve when fastMode kill switch is on', () => {
    const { calls, deps } = makeFakeDeps({
      getFeatureValue: (key) => key === 'ncode_miraculo_the_bard',
    })
    runStartupPrefetches('local_interactive', deps)

    expect(calls.prefetchFastModeStatus).toBeUndefined()
    expect(calls.resolveFastModeStatusFromCache).toBe(1)
  })
})

describe('runStartupPrefetches throttling', () => {
  it('skips network prefetches when bare mode is active', () => {
    const { calls, deps } = makeFakeDeps({ isBareMode: () => true })
    runStartupPrefetches('local_interactive', deps)

    expect(calls.checkQuotaStatus).toBeUndefined()
    expect(calls.prefetchPassesEligibility).toBeUndefined()
    expect(calls.fetchBootstrapData).toBeUndefined()
    expect(calls.prefetchFastModeStatus).toBeUndefined()
    expect(calls.resolveFastModeStatusFromCache).toBe(1)
    // exampleCommands is NOT gated by skipStartupPrefetches
    expect(calls.refreshExampleCommands).toBe(1)
  })

  it('skips network prefetches when throttle window is active', () => {
    const throttleMs = 10_000
    const now = 1_000_000
    const lastPrefetched = now - throttleMs + 1000 // inside window

    const { calls, deps } = makeFakeDeps({
      getFeatureValue: (key) =>
        key === 'ncode_cicada_nap_ms' ? throttleMs : undefined,
      getGlobalConfig: () => ({ startupPrefetchedAt: lastPrefetched }),
      now: () => now,
    })

    runStartupPrefetches('local_interactive', deps)

    expect(calls.checkQuotaStatus).toBeUndefined()
    expect(calls.prefetchPassesEligibility).toBeUndefined()
    expect(calls.fetchBootstrapData).toBeUndefined()
    // fastMode cache-resolve still fires in skip path
    expect(calls.resolveFastModeStatusFromCache).toBe(1)
    expect(calls.refreshExampleCommands).toBe(1)
  })

  it('runs prefetches when throttle window has elapsed', () => {
    const throttleMs = 10_000
    const now = 1_000_000
    const lastPrefetched = now - throttleMs - 1000 // outside window

    const { calls, deps } = makeFakeDeps({
      getFeatureValue: (key) =>
        key === 'ncode_cicada_nap_ms' ? throttleMs : undefined,
      getGlobalConfig: () => ({ startupPrefetchedAt: lastPrefetched }),
      now: () => now,
    })

    runStartupPrefetches('local_interactive', deps)

    expect(calls.checkQuotaStatus).toBe(1)
    expect(calls.fetchBootstrapData).toBe(1)
  })

  it('persists startupPrefetchedAt when throttle is configured', () => {
    const throttleMs = 10_000
    let savedAt: number | undefined

    const { deps } = makeFakeDeps({
      getFeatureValue: (key, fallback) =>
        key === 'ncode_cicada_nap_ms' ? throttleMs : fallback,
      saveGlobalConfig: updater => {
        savedAt = updater({}).startupPrefetchedAt
      },
      now: () => 1_000_000,
    })

    runStartupPrefetches('local_interactive', deps)
    expect(savedAt).toBe(1_000_000)
  })
})
