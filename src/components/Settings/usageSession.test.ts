import { describe, expect, test } from 'bun:test'
import { buildUsageSessionState } from './usageSession.js'

describe('buildUsageSessionState', () => {
  test('shows the Sonnet bar for managed max sessions', () => {
    expect(
      buildUsageSessionState({
        providerPlan: {
          mode: 'noumena_managed',
          source: 'managed_principal',
          staticKeyEnvVarName: null,
        },
        headersKind: 'bearer',
        scopes: ['user:inference'],
        subscription: {
          subscriptionName: 'Noumena Max',
          subscriptionType: 'max',
          rateLimitTier: 'tier-1',
        },
      }),
    ).toEqual({
      subscriptionType: 'max',
      showSonnetBar: true,
      isProOrMax: true,
    })
  })

  test('hides extra usage for team sessions', () => {
    expect(
      buildUsageSessionState({
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
          rateLimitTier: 'tier-1',
        },
      }),
    ).toEqual({
      subscriptionType: 'team',
      showSonnetBar: true,
      isProOrMax: false,
    })
  })

  test('keeps null-subscription behavior for static byok sessions', () => {
    expect(
      buildUsageSessionState({
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
      subscriptionType: null,
      showSonnetBar: true,
      isProOrMax: false,
    })
  })
})
