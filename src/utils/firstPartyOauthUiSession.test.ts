import { describe, expect, it } from 'bun:test'
import { isFirstPartyOauthUiEnabledForSession } from './firstPartyOauthUiSession.js'

describe('firstPartyOauthUiSession', () => {
  it('stays enabled for no-session, managed, and console-key contexts', () => {
    expect(
      isFirstPartyOauthUiEnabledForSession({
        principalSource: 'none',
      }),
    ).toBe(true)

    expect(
      isFirstPartyOauthUiEnabledForSession({
        principalSource: 'managed_oauth',
      }),
    ).toBe(true)

    expect(
      isFirstPartyOauthUiEnabledForSession({
        principalSource: 'console_api_key',
      }),
    ).toBe(true)
  })

  it('is disabled for direct api-key, service, external bearer, and third-party contexts', () => {
    expect(
      isFirstPartyOauthUiEnabledForSession({
        principalSource: 'direct_api_key_env',
      }),
    ).toBe(false)

    expect(
      isFirstPartyOauthUiEnabledForSession({
        principalSource: 'api_key_helper',
      }),
    ).toBe(false)

    expect(
      isFirstPartyOauthUiEnabledForSession({
        principalSource: 'service_oauth_env',
      }),
    ).toBe(false)

    expect(
      isFirstPartyOauthUiEnabledForSession({
        principalSource: 'external_bearer_compat',
      }),
    ).toBe(false)

    expect(
      isFirstPartyOauthUiEnabledForSession({
        principalSource: 'third_party_provider',
      }),
    ).toBe(false)
  })
})
