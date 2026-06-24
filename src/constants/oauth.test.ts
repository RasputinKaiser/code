import { afterEach, describe, expect, it } from 'bun:test'
import {
  getDefaultFirstPartyInferenceBaseUrl,
  getLegacyAnthropicSdkBaseUrl,
  getOauthAuthorizeUrl,
  getOauthClientId,
  getOauthManualRedirectUrl,
  getOauthSuccessUrl,
  getOauthTokenUrl,
} from './oauth.js'

const savedEnv = {
  NCODE_BUILD_MODE: process.env.NCODE_BUILD_MODE,
  NOUMENA_ISSUER_BASE_URL: process.env.NOUMENA_ISSUER_BASE_URL,
  NOUMENA_OAUTH_WEB_BASE_URL: process.env.NOUMENA_OAUTH_WEB_BASE_URL,
  CLAUDE_CODE_CUSTOM_OAUTH_URL: process.env.CLAUDE_CODE_CUSTOM_OAUTH_URL,
  USER_TYPE: process.env.USER_TYPE,
  USE_LOCAL_OAUTH: process.env.USE_LOCAL_OAUTH,
}

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
})

async function importFreshOauthModule() {
  return import(`./oauth.ts?nonce=${Date.now()}-${Math.random()}`)
}

describe('oauth URL helpers', () => {
  it('uses the Noumena issuer for token and derives the code web host for authorize/callback/success pages', () => {
    process.env.NOUMENA_ISSUER_BASE_URL = 'https://issuer.noumena.test/'
    delete process.env.NOUMENA_OAUTH_WEB_BASE_URL
    delete process.env.CLAUDE_CODE_CUSTOM_OAUTH_URL
    delete process.env.NCODE_BUILD_MODE
    delete process.env.USER_TYPE
    delete process.env.USE_LOCAL_OAUTH

    expect(getOauthAuthorizeUrl(false)).toBe(
      'https://code.noumena.test/oauth/authorize',
    )
    expect(getOauthAuthorizeUrl(true)).toBe(
      'https://code.noumena.test/oauth/authorize',
    )
    expect(getOauthTokenUrl()).toBe('https://issuer.noumena.test/oauth/token')
    expect(getOauthClientId()).toBe('noumena-code')
    expect(getOauthManualRedirectUrl()).toBe(
      'https://code.noumena.test/oauth/code/callback?app=noumena-code',
    )
    expect(getOauthSuccessUrl(false)).toBe(
      'https://code.noumena.test/oauth/code/success?app=noumena-code',
    )
    expect(getOauthSuccessUrl(true)).toBe(
      'https://code.noumena.test/oauth/code/success?app=noumena-code',
    )
  })

  it('keeps custom oauth callback and success URLs on the approved custom base', () => {
    delete process.env.NOUMENA_ISSUER_BASE_URL
    process.env.CLAUDE_CODE_CUSTOM_OAUTH_URL = 'https://claude.fedstart.com'
    delete process.env.NOUMENA_OAUTH_WEB_BASE_URL
    delete process.env.NCODE_BUILD_MODE
    delete process.env.USER_TYPE
    delete process.env.USE_LOCAL_OAUTH

    expect(getOauthManualRedirectUrl()).toBe(
      'https://claude.fedstart.com/oauth/code/callback',
    )
    expect(getOauthSuccessUrl(false)).toBe(
      'https://claude.fedstart.com/oauth/code/success?app=noumena-code',
    )
    expect(getOauthSuccessUrl(true)).toBe(
      'https://claude.fedstart.com/oauth/code/success?app=noumena-code',
    )
  })

  it('prefers the explicit Noumena OAuth web base for authorize/callback/success pages', () => {
    process.env.NOUMENA_ISSUER_BASE_URL = 'https://issuer.noumena.test/'
    process.env.NOUMENA_OAUTH_WEB_BASE_URL = 'https://auth.noumena.test/'
    delete process.env.CLAUDE_CODE_CUSTOM_OAUTH_URL
    delete process.env.NCODE_BUILD_MODE
    delete process.env.USER_TYPE
    delete process.env.USE_LOCAL_OAUTH

    expect(getOauthAuthorizeUrl(false)).toBe(
      'https://code.noumena.test/oauth/authorize',
    )
    expect(getOauthTokenUrl()).toBe('https://issuer.noumena.test/oauth/token')
    expect(getOauthClientId()).toBe('noumena-code')
    expect(getOauthManualRedirectUrl()).toBe(
      'https://code.noumena.test/oauth/code/callback?app=noumena-code',
    )
    expect(getOauthSuccessUrl(false)).toBe(
      'https://code.noumena.test/oauth/code/success?app=noumena-code',
    )
    expect(getOauthSuccessUrl(true)).toBe(
      'https://code.noumena.test/oauth/code/success?app=noumena-code',
    )
  })

  it('exposes the default first-party inference base URL behind a dedicated helper', () => {
    delete process.env.NOUMENA_ISSUER_BASE_URL
    delete process.env.NOUMENA_OAUTH_WEB_BASE_URL
    delete process.env.CLAUDE_CODE_CUSTOM_OAUTH_URL
    delete process.env.NCODE_BUILD_MODE
    delete process.env.USER_TYPE
    delete process.env.USE_LOCAL_OAUTH

    expect(getDefaultFirstPartyInferenceBaseUrl()).toBe(
      'https://api.noumena.com',
    )
    expect(getOauthClientId()).toBe('noumena-code')
    expect(getLegacyAnthropicSdkBaseUrl()).toBeUndefined()
  })

  it('does not expose a legacy Anthropic SDK base URL override', () => {
    delete process.env.NOUMENA_ISSUER_BASE_URL
    delete process.env.NOUMENA_OAUTH_WEB_BASE_URL
    delete process.env.CLAUDE_CODE_CUSTOM_OAUTH_URL
    process.env.NCODE_BUILD_MODE = 'noumena'
    delete process.env.USER_TYPE
    delete process.env.USE_LOCAL_OAUTH

    expect(getLegacyAnthropicSdkBaseUrl()).toBeUndefined()
  })

  it('defaults Noumena builds onto Noumena-owned production OAuth hosts', async () => {
    delete process.env.NOUMENA_ISSUER_BASE_URL
    delete process.env.NOUMENA_OAUTH_WEB_BASE_URL
    delete process.env.CLAUDE_CODE_CUSTOM_OAUTH_URL
    process.env.NCODE_BUILD_MODE = 'noumena'
    delete process.env.USER_TYPE
    delete process.env.USE_LOCAL_OAUTH

    const oauth = await importFreshOauthModule()

    expect(oauth.getOauthAuthorizeUrl(false)).toBe(
      'https://code.noumena.com/oauth/authorize',
    )
    expect(oauth.getOauthAuthorizeUrl(true)).toBe(
      'https://code.noumena.com/oauth/authorize',
    )
    expect(oauth.getOauthTokenUrl()).toBe(
      'https://api.noumena.com/oauth/token',
    )
    expect(oauth.getOauthManualRedirectUrl()).toBe(
      'https://code.noumena.com/oauth/code/callback',
    )
    expect(oauth.getOauthSuccessUrl(false)).toBe(
      'https://code.noumena.com/oauth/code/success?app=noumena-code',
    )
    expect(oauth.getOauthSuccessUrl(true)).toBe(
      'https://code.noumena.com/oauth/code/success?app=noumena-code',
    )
    expect(oauth.getOauthClientId()).toBe('noumena-code')
    expect(oauth.getDefaultFirstPartyInferenceBaseUrl()).toBe(
      'https://api.noumena.com',
    )
  })

  it('uses the explicit Noumena issuer URLs when configured via env', async () => {
    delete process.env.NOUMENA_ISSUER_BASE_URL
    process.env.NOUMENA_ISSUER_BASE_URL = 'https://issuer.noumena.test/'
    delete process.env.NOUMENA_OAUTH_WEB_BASE_URL
    delete process.env.CLAUDE_CODE_CUSTOM_OAUTH_URL
    delete process.env.NCODE_BUILD_MODE
    delete process.env.USER_TYPE
    delete process.env.USE_LOCAL_OAUTH

    const oauth = await importFreshOauthModule()

    expect(oauth.getOauthAuthorizeUrl(false)).toBe(
      'https://code.noumena.test/oauth/authorize',
    )
    expect(oauth.getOauthTokenUrl()).toBe(
      'https://issuer.noumena.test/oauth/token',
    )
    expect(oauth.getOauthManualRedirectUrl()).toBe(
      'https://code.noumena.test/oauth/code/callback?app=noumena-code',
    )
  })
})
