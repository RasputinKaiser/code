import { describe, expect, it } from 'bun:test'
import {
  getManagedProviderAccessToken,
  isThirdPartyProviderSession,
} from './providerSession.js'

describe('providerSession', () => {
  it('detects third-party provider sessions from canonical provider plan truth', () => {
    expect(
      isThirdPartyProviderSession({
        providerPlan: { mode: 'third_party_provider', source: 'third_party_provider', staticKeyEnvVarName: null },
        headersKind: 'none',
        accessToken: null,
      }),
    ).toBe(true)

    expect(
      isThirdPartyProviderSession({
        providerPlan: { mode: 'noumena_managed', source: 'managed_principal', staticKeyEnvVarName: null },
        headersKind: 'bearer',
        accessToken: 'token',
      }),
    ).toBe(false)
  })

  it('returns only canonical managed bearer access tokens', () => {
    expect(
      getManagedProviderAccessToken({
        providerPlan: { mode: 'noumena_managed', source: 'managed_principal', staticKeyEnvVarName: null },
        headersKind: 'bearer',
        accessToken: 'managed-token',
      }),
    ).toBe('managed-token')

    expect(
      getManagedProviderAccessToken({
        providerPlan: { mode: 'byok_static_env', source: 'direct_api_key_env', staticKeyEnvVarName: 'ANTHROPIC_API_KEY' },
        headersKind: 'api_key',
        accessToken: null,
      }),
    ).toBe('')
  })
})
