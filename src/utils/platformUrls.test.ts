import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

const { getOauthConfig } = await import(import.meta.resolve('../constants/oauth.ts'))

const {
  buildNoumenaPlatformUrl,
  buildNoumenaPlatformWebSocketUrl,
  getNoumenaPlatformBaseUrl,
  getNoumenaPlatformWebSocketBaseUrl,
  getSessionCompatiblePlatformBaseUrl,
} = await import(import.meta.resolve('./platformUrls.ts'))

function oauthBaseApiUrl(): string {
  return getOauthConfig().BASE_API_URL.replace(/\/$/, '')
}

function oauthWebSocketBaseUrl(): string {
  const baseUrl = oauthBaseApiUrl()
  if (baseUrl.startsWith('https://')) {
    return `wss://${baseUrl.slice('https://'.length)}`
  }
  if (baseUrl.startsWith('http://')) {
    return `ws://${baseUrl.slice('http://'.length)}`
  }
  return baseUrl
}

function resetEnv() {
  delete process.env.NOUMENA_PLATFORM_BASE_URL
  delete process.env.ANTHROPIC_BASE_URL
  delete process.env.USER_TYPE
}

beforeEach(resetEnv)
afterEach(resetEnv)

describe('platformUrls', () => {
  it('defaults to the oauth base api url', () => {
    expect(getNoumenaPlatformBaseUrl()).toBe(oauthBaseApiUrl())
  })

  it('prefers NOUMENA_PLATFORM_BASE_URL when set', () => {
    process.env.NOUMENA_PLATFORM_BASE_URL = 'http://127.0.0.1:4100/'
    expect(getNoumenaPlatformBaseUrl()).toBe('http://127.0.0.1:4100')
  })

  it('derives websocket urls from the platform base url', () => {
    expect(getNoumenaPlatformWebSocketBaseUrl()).toBe(oauthWebSocketBaseUrl())

    process.env.NOUMENA_PLATFORM_BASE_URL = 'http://127.0.0.1:4100'
    expect(getNoumenaPlatformWebSocketBaseUrl()).toBe('ws://127.0.0.1:4100')
  })

  it('builds http and websocket urls from relative paths', () => {
    expect(buildNoumenaPlatformUrl('/v1/sessions')).toBe(
      `${oauthBaseApiUrl()}/v1/sessions`,
    )
    expect(buildNoumenaPlatformWebSocketUrl('v1/sessions/ws/abc')).toBe(
      `${oauthWebSocketBaseUrl()}/v1/sessions/ws/abc`,
    )
  })

  it('uses the Noumena platform override for session-compatible base urls', () => {
    process.env.NOUMENA_PLATFORM_BASE_URL = 'http://127.0.0.1:4100/'
    process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com'

    expect(getSessionCompatiblePlatformBaseUrl()).toBe(
      'http://127.0.0.1:4100',
    )
  })

  it('preserves legacy first-party anthropic base urls for session-compatible flows', () => {
    process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com/'

    expect(getSessionCompatiblePlatformBaseUrl()).toBe(
      'https://api.anthropic.com',
    )
  })

  it('ignores non-first-party ANTHROPIC_BASE_URL values for session-compatible flows', () => {
    process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:18000'

    expect(getSessionCompatiblePlatformBaseUrl()).toBe(
      oauthBaseApiUrl(),
    )
  })
})
