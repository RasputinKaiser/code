import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { resetGrowthBook } from '../services/analytics/growthbook.js'
import { getPollIntervalConfig } from './pollConfig.js'
import { DEFAULT_POLL_CONFIG } from './pollConfigDefaults.js'

const originalUserType = process.env.USER_TYPE
const originalFcOverrides = process.env.CLAUDE_INTERNAL_FC_OVERRIDES

function restoreEnvVar(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

function setPollConfigOverride(raw: unknown): void {
  process.env.USER_TYPE = 'ant'
  process.env.CLAUDE_INTERNAL_FC_OVERRIDES = JSON.stringify({
    ncode_bridge_poll_interval_config: raw,
  })
  resetGrowthBook()
}

beforeEach(() => {
  restoreEnvVar('USER_TYPE', originalUserType)
  restoreEnvVar('CLAUDE_INTERNAL_FC_OVERRIDES', originalFcOverrides)
  resetGrowthBook()
})

afterEach(() => {
  restoreEnvVar('USER_TYPE', originalUserType)
  restoreEnvVar('CLAUDE_INTERNAL_FC_OVERRIDES', originalFcOverrides)
  resetGrowthBook()
})

describe('getPollIntervalConfig', () => {
  it('accepts legacy single-session config and fills rollout defaults for newer fields', () => {
    setPollConfigOverride({
      poll_interval_ms_not_at_capacity: 500,
      poll_interval_ms_at_capacity: 10_000,
      non_exclusive_heartbeat_interval_ms: 30_000,
    })

    expect(getPollIntervalConfig()).toEqual({
      poll_interval_ms_not_at_capacity: 500,
      poll_interval_ms_at_capacity: 10_000,
      non_exclusive_heartbeat_interval_ms: 30_000,
      multisession_poll_interval_ms_not_at_capacity:
        DEFAULT_POLL_CONFIG.multisession_poll_interval_ms_not_at_capacity,
      multisession_poll_interval_ms_partial_capacity:
        DEFAULT_POLL_CONFIG.multisession_poll_interval_ms_partial_capacity,
      multisession_poll_interval_ms_at_capacity:
        DEFAULT_POLL_CONFIG.multisession_poll_interval_ms_at_capacity,
      reclaim_older_than_ms: 5000,
      session_keepalive_interval_v2_ms: 120_000,
    })
  })

  it('falls back to defaults when a poll interval violates the safety floor', () => {
    setPollConfigOverride({
      ...DEFAULT_POLL_CONFIG,
      poll_interval_ms_not_at_capacity: 99,
    })

    expect(getPollIntervalConfig()).toEqual(DEFAULT_POLL_CONFIG)
  })

  it('falls back to defaults when at-capacity liveness is disabled for a bridge lane', () => {
    setPollConfigOverride({
      ...DEFAULT_POLL_CONFIG,
      non_exclusive_heartbeat_interval_ms: 0,
      poll_interval_ms_at_capacity: 0,
    })

    expect(getPollIntervalConfig()).toEqual(DEFAULT_POLL_CONFIG)
  })
})
