import { describe, expect, test } from 'bun:test'
import { buildChannelsNoticeSessionState } from './channelsNoticeSession.js'

describe('buildChannelsNoticeSessionState', () => {
  test('treats oauth-backed managed team sessions as authenticated and policy-managed', () => {
    expect(
      buildChannelsNoticeSessionState({
        providerPlan: {
          mode: 'noumena_managed',
          source: 'managed_principal',
          staticKeyEnvVarName: null,
        },
        headersKind: 'bearer',
        scopes: ['user:inference'],
        subscription: {
          subscriptionName: 'Noumena Team',
          subscriptionType: 'team',
          rateLimitTier: 'default',
        },
      }),
    ).toEqual({
      noAuth: false,
      subscriptionType: 'team',
      isManagedTeamOrEnterprise: true,
    })
  })

  test('treats direct api key sessions as unauthenticated for channels', () => {
    expect(
      buildChannelsNoticeSessionState({
        providerPlan: {
          mode: 'noumena_managed',
          source: 'direct_api_key_env',
          staticKeyEnvVarName: 'NOUMENA_API_KEY',
        },
        headersKind: 'api_key',
        scopes: [],
        subscription: {
          subscriptionName: null,
          subscriptionType: null,
          rateLimitTier: null,
        },
      }),
    ).toEqual({
      noAuth: true,
      subscriptionType: null,
      isManagedTeamOrEnterprise: false,
    })
  })

  test('treats static byok sessions as unauthenticated for channels', () => {
    expect(
      buildChannelsNoticeSessionState({
        providerPlan: {
          mode: 'byok_static_env',
          source: 'direct_api_key_env',
          staticKeyEnvVarName: 'ANTHROPIC_API_KEY',
        },
        headersKind: 'api_key',
        scopes: [],
        subscription: {
          subscriptionName: null,
          subscriptionType: null,
          rateLimitTier: null,
        },
      }),
    ).toEqual({
      noAuth: true,
      subscriptionType: null,
      isManagedTeamOrEnterprise: false,
    })
  })
})
