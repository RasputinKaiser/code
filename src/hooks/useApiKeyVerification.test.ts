import { describe, expect, it } from 'bun:test'

import {
  getInitialApiKeyVerificationStatus,
  shouldSkipApiKeyVerificationForAuthState,
} from './useApiKeyVerification.js'

describe('shouldSkipApiKeyVerificationForAuthState', () => {
  it('skips verification when a managed auth token is already present', () => {
    expect(
      shouldSkipApiKeyVerificationForAuthState({
        apiProvider: 'firstParty',
        bareMode: false,
        providerMode: 'noumena_managed',
        principalSource: 'service_oauth_env',
        hasAuthToken: true,
      }),
    ).toBe(true)
  })

  it('skips verification when a managed principal is active even if the token is expired', () => {
    expect(
      shouldSkipApiKeyVerificationForAuthState({
        apiProvider: 'firstParty',
        bareMode: false,
        providerMode: 'noumena_managed',
        principalSource: 'managed_oauth',
        hasAuthToken: false,
      }),
    ).toBe(true)
  })

  it('requires verification for first-party API-key sessions with no auth token', () => {
    expect(
      shouldSkipApiKeyVerificationForAuthState({
        apiProvider: 'firstParty',
        bareMode: false,
        providerMode: 'noumena_managed',
        principalSource: 'direct_api_key_env',
        hasAuthToken: false,
      }),
    ).toBe(false)
  })

  it('skips verification for static BYOK env sessions', () => {
    expect(
      shouldSkipApiKeyVerificationForAuthState({
        apiProvider: 'firstParty',
        bareMode: false,
        providerMode: 'byok_static_env',
        principalSource: 'direct_api_key_env',
        hasAuthToken: false,
      }),
    ).toBe(true)
  })

  it('treats configured API-key sources as loading without executing helper state', () => {
    expect(
      getInitialApiKeyVerificationStatus({
        apiKey: 'noumena-key',
        rawApiKeySource: 'NOUMENA_API_KEY',
      }),
    ).toBe('loading')
    expect(
      getInitialApiKeyVerificationStatus({
        apiKey: null,
        rawApiKeySource: 'apiKeyHelper',
      }),
    ).toBe('loading')
  })

  it('treats missing canonical API-key state as missing', () => {
    expect(
      getInitialApiKeyVerificationStatus({
        apiKey: null,
        rawApiKeySource: null,
      }),
    ).toBe('missing')
  })
})
