import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { clearOAuthTokenCache } from '../utils/auth.js'
import {
  getBridgeAccessToken,
  getBridgeBaseUrl,
  getBridgeBaseUrlOverride,
  getBridgeTokenOverride,
} from './bridgeConfig.js'

const envKeys = [
  'USER_TYPE',
  'CLAUDE_BRIDGE_OAUTH_TOKEN',
  'CLAUDE_BRIDGE_BASE_URL',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'NOUMENA_API_KEY',
  'NOUMENA_PLATFORM_BASE_URL',
  'ANTHROPIC_BASE_URL',
] as const

const originalEnv = Object.fromEntries(
  envKeys.map(key => [key, process.env[key]]),
) as Record<(typeof envKeys)[number], string | undefined>

function resetEnv() {
  for (const key of envKeys) {
    const value = originalEnv[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  clearOAuthTokenCache()
}

beforeEach(resetEnv)
afterEach(resetEnv)

describe('bridgeConfig', () => {
  it('uses the ant-only bridge env overrides when present', () => {
    process.env.USER_TYPE = 'ant'
    process.env.CLAUDE_BRIDGE_OAUTH_TOKEN = 'bridge-oauth-token'
    process.env.CLAUDE_BRIDGE_BASE_URL = 'https://bridge-override.noumena.test'
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'fallback-oauth-token'
    process.env.NOUMENA_PLATFORM_BASE_URL = 'https://platform.noumena.test'
    clearOAuthTokenCache()

    expect(getBridgeTokenOverride()).toBe('bridge-oauth-token')
    expect(getBridgeBaseUrlOverride()).toBe(
      'https://bridge-override.noumena.test',
    )
    expect(getBridgeAccessToken()).toBe('bridge-oauth-token')
    expect(getBridgeBaseUrl()).toBe('https://bridge-override.noumena.test')
  })

  it('ignores bridge override env vars for non-ant users and falls back to oauth plus platform base url', () => {
    process.env.USER_TYPE = 'external'
    process.env.CLAUDE_BRIDGE_OAUTH_TOKEN = 'bridge-oauth-token'
    process.env.CLAUDE_BRIDGE_BASE_URL = 'https://bridge-override.noumena.test'
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'session-oauth-token'
    process.env.NOUMENA_PLATFORM_BASE_URL = 'https://platform.noumena.test/'
    clearOAuthTokenCache()

    expect(getBridgeAccessToken()).toBe('session-oauth-token')
    expect(getBridgeBaseUrl()).toBe('https://platform.noumena.test')
  })

  it('does not treat direct API key sessions as bridge bearer auth', () => {
    process.env.USER_TYPE = 'external'
    process.env.NOUMENA_API_KEY = 'noumena-api-key'
    process.env.NOUMENA_PLATFORM_BASE_URL = 'https://platform.noumena.test/'
    clearOAuthTokenCache()

    expect(getBridgeAccessToken()).toBeUndefined()
    expect(getBridgeBaseUrl()).toBe('https://platform.noumena.test')
  })

  it('uses the first-party legacy anthropic base url when no Noumena override is set', () => {
    delete process.env.NOUMENA_PLATFORM_BASE_URL
    process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com/'

    expect(getBridgeBaseUrl()).toBe('https://api.anthropic.com')
  })
})
