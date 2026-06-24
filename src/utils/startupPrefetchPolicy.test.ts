import { describe, expect, it } from 'bun:test'
import type { SessionLifecycle } from './sessionLifecycle.js'
import {
  STARTUP_PREFETCHES,
  getApplicablePrefetchIds,
  shouldRunStartupPrefetch,
} from './startupPrefetchPolicy.js'

describe('getApplicablePrefetchIds', () => {
  it('returns all local-interactive prefetches for local_interactive', () => {
    const result = getApplicablePrefetchIds('local_interactive')
    expect(result).toEqual(['quota', 'passes', 'bootstrap', 'fastMode', 'exampleCommands'])
  })

  it('returns only quota and passes for noninteractive', () => {
    const result = getApplicablePrefetchIds('noninteractive')
    expect(result).toEqual(['quota', 'passes'])
  })

  it('returns empty array for remote session modes', () => {
    const remoteModes: SessionLifecycle[] = [
      'remote',
      'teleport',
      'ssh_remote',
      'direct_connect',
      'assistant',
    ]
    for (const mode of remoteModes) {
      expect(getApplicablePrefetchIds(mode)).toEqual([])
    }
  })
})

describe('shouldRunStartupPrefetch', () => {
  it('allows bootstrap only in local_interactive', () => {
    expect(shouldRunStartupPrefetch('local_interactive', 'bootstrap')).toBe(true)
    expect(shouldRunStartupPrefetch('noninteractive', 'bootstrap')).toBe(false)
    expect(shouldRunStartupPrefetch('remote', 'bootstrap')).toBe(false)
    expect(shouldRunStartupPrefetch('teleport', 'bootstrap')).toBe(false)
  })

  it('allows quota in local_interactive and noninteractive but not remote modes', () => {
    expect(shouldRunStartupPrefetch('local_interactive', 'quota')).toBe(true)
    expect(shouldRunStartupPrefetch('noninteractive', 'quota')).toBe(true)
    expect(shouldRunStartupPrefetch('remote', 'quota')).toBe(false)
    expect(shouldRunStartupPrefetch('teleport', 'quota')).toBe(false)
    expect(shouldRunStartupPrefetch('assistant', 'quota')).toBe(false)
  })

  it('allows exampleCommands only in local_interactive', () => {
    expect(shouldRunStartupPrefetch('local_interactive', 'exampleCommands')).toBe(true)
    expect(shouldRunStartupPrefetch('noninteractive', 'exampleCommands')).toBe(false)
    expect(shouldRunStartupPrefetch('remote', 'exampleCommands')).toBe(false)
  })

  it('returns false for unknown prefetch ids', () => {
    expect(shouldRunStartupPrefetch('local_interactive', 'unknownPrefetch')).toBe(false)
  })

  it('does not allow fastMode in any remote mode', () => {
    const remoteModes: SessionLifecycle[] = [
      'remote',
      'teleport',
      'ssh_remote',
      'direct_connect',
      'assistant',
    ]
    for (const mode of remoteModes) {
      expect(shouldRunStartupPrefetch(mode, 'fastMode')).toBe(false)
    }
  })
})

describe('STARTUP_PREFETCHES table integrity', () => {
  it('covers every declared prefetch id', () => {
    const ids = STARTUP_PREFETCHES.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('no prefetch applies to all modes (would indicate missing filtering)', () => {
    const allModes: SessionLifecycle[] = [
      'local_interactive',
      'noninteractive',
      'remote',
      'teleport',
      'ssh_remote',
      'direct_connect',
      'assistant',
    ]
    for (const prefetch of STARTUP_PREFETCHES) {
      const coverage = allModes.filter(m => prefetch.applicableTo.includes(m))
      // At least one mode should NOT be applicable — otherwise the prefetch
      // is universal and there's no filtering purpose.
      expect(coverage.length).toBeLessThan(allModes.length)
    }
  })

  it('every prefetch id is reachable by some lifecycle mode', () => {
    for (const prefetch of STARTUP_PREFETCHES) {
      expect(prefetch.applicableTo.length).toBeGreaterThan(0)
    }
  })
})
