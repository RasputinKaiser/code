import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { resetGrowthBook } from '../services/analytics/growthbook.js'
import {
  checkEnvLessBridgeMinVersion,
  DEFAULT_ENV_LESS_BRIDGE_CONFIG,
  getEnvLessBridgeConfig,
} from './envLessBridgeConfig.js'

const originalUserType = process.env.USER_TYPE
const originalFcOverrides = process.env.CLAUDE_INTERNAL_FC_OVERRIDES
const originalMacro = (globalThis as { MACRO?: { VERSION: string } }).MACRO

function restoreEnvVar(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

function setEnvLessBridgeOverride(raw: unknown): void {
  process.env.USER_TYPE = 'ant'
  process.env.CLAUDE_INTERNAL_FC_OVERRIDES = JSON.stringify({
    ncode_bridge_repl_v2_config: raw,
  })
  resetGrowthBook()
}

beforeEach(() => {
  restoreEnvVar('USER_TYPE', originalUserType)
  restoreEnvVar('CLAUDE_INTERNAL_FC_OVERRIDES', originalFcOverrides)
  ;(globalThis as { MACRO?: { VERSION: string } }).MACRO = {
    VERSION: '1.0.0-test',
  }
  resetGrowthBook()
})

afterEach(() => {
  restoreEnvVar('USER_TYPE', originalUserType)
  restoreEnvVar('CLAUDE_INTERNAL_FC_OVERRIDES', originalFcOverrides)
  ;(globalThis as { MACRO?: { VERSION: string } }).MACRO = originalMacro
  resetGrowthBook()
})

describe('envLessBridgeConfig', () => {
  it('accepts partial v2 bridge config and fills durable defaults for omitted fields', async () => {
    setEnvLessBridgeOverride({
      init_retry_max_attempts: 5,
      http_timeout_ms: 12_000,
      token_refresh_buffer_ms: 120_000,
      min_version: '1.2.3',
    })

    await expect(getEnvLessBridgeConfig()).resolves.toEqual({
      ...DEFAULT_ENV_LESS_BRIDGE_CONFIG,
      init_retry_max_attempts: 5,
      http_timeout_ms: 12_000,
      token_refresh_buffer_ms: 120_000,
      min_version: '1.2.3',
    })
  })

  it('falls back to defaults when the override violates a safety floor or cap', async () => {
    setEnvLessBridgeOverride({
      ...DEFAULT_ENV_LESS_BRIDGE_CONFIG,
      connect_timeout_ms: 1000,
    })

    await expect(getEnvLessBridgeConfig()).resolves.toEqual(
      DEFAULT_ENV_LESS_BRIDGE_CONFIG,
    )
  })

  it('surfaces a user-facing update message when the v2 bridge min version is above the current CLI version', async () => {
    setEnvLessBridgeOverride({
      min_version: '9999.0.0',
    })

    const message = await checkEnvLessBridgeMinVersion()

    expect(message).toContain('too old for Remote Control')
    expect(message).toContain('9999.0.0')
    expect(message).toContain('Run `code update` to update.')
  })
})
