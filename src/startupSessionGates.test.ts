import { describe, expect, test } from 'bun:test'
import {
  hasChromeStartupEligibilitySession,
  hasUsableBridgeStartupSession,
  shouldSkipDevChannelsDialog,
} from './startupSessionGates.js'

describe('shouldSkipDevChannelsDialog', () => {
  test('skips when channels are disabled', () => {
    expect(
      shouldSkipDevChannelsDialog({
        channelsEnabled: false,
        session: {
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
          principalSource: 'managed_oauth',
          sessionState: 'usable',
          accessToken: 'managed-token',
        },
      }),
    ).toBe(true)
  })

  test('skips for non-oauth api-key sessions', () => {
    expect(
      shouldSkipDevChannelsDialog({
        channelsEnabled: true,
        session: {
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
          principalSource: 'direct_api_key_env',
          sessionState: 'usable',
          accessToken: null,
        },
      }),
    ).toBe(true)
  })

  test('does not skip for oauth-backed first-party sessions', () => {
    expect(
      shouldSkipDevChannelsDialog({
        channelsEnabled: true,
        session: {
          providerPlan: {
            mode: 'noumena_managed',
            source: 'managed_principal',
            staticKeyEnvVarName: null,
          },
          headersKind: 'bearer',
          scopes: ['user:inference'],
          subscription: {
            subscriptionName: 'Noumena Pro',
            subscriptionType: 'pro',
            rateLimitTier: 'default',
          },
          principalSource: 'managed_oauth',
          sessionState: 'usable',
          accessToken: 'managed-token',
        },
      }),
    ).toBe(false)
  })
})

describe('hasUsableBridgeStartupSession', () => {
  test('accepts usable managed sessions with an access token', () => {
    expect(
      hasUsableBridgeStartupSession({
        principalSource: 'managed_oauth',
        sessionState: 'usable',
        accessToken: 'managed-token',
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
    ).toBe(true)
  })

  test('rejects expired managed sessions', () => {
    expect(
      hasUsableBridgeStartupSession({
        principalSource: 'managed_oauth',
        sessionState: 'expired',
        accessToken: 'stale-token',
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
    ).toBe(false)
  })

  test('rejects non-managed sessions', () => {
    expect(
      hasUsableBridgeStartupSession({
        principalSource: 'service_oauth_env',
        sessionState: 'usable',
        accessToken: 'service-token',
        providerPlan: {
          mode: 'noumena_managed',
          source: 'service_credential',
          staticKeyEnvVarName: null,
        },
        headersKind: 'bearer',
        scopes: ['user:inference'],
        subscription: {
          subscriptionName: null,
          subscriptionType: null,
          rateLimitTier: null,
        },
      }),
    ).toBe(false)
  })
})

describe('hasChromeStartupEligibilitySession', () => {
  test('accepts internal noumena builds without a managed session', () => {
    expect(
      hasChromeStartupEligibilitySession({
        buildMode: 'noumena',
        userType: undefined,
        session: null,
      }),
    ).toBe(true)
  })

  test('accepts internal ant users without a managed session', () => {
    expect(
      hasChromeStartupEligibilitySession({
        buildMode: undefined,
        userType: 'ant',
        session: null,
      }),
    ).toBe(true)
  })

  test('accepts oauth-backed first-party sessions', () => {
    expect(
      hasChromeStartupEligibilitySession({
        buildMode: undefined,
        userType: undefined,
        session: {
          providerPlan: {
            mode: 'noumena_managed',
            source: 'managed_principal',
            staticKeyEnvVarName: null,
          },
          headersKind: 'bearer',
          scopes: ['user:inference'],
          subscription: {
            subscriptionName: 'Noumena Pro',
            subscriptionType: 'pro',
            rateLimitTier: 'default',
          },
          principalSource: 'managed_oauth',
          sessionState: 'usable',
          accessToken: 'managed-token',
        },
      }),
    ).toBe(true)
  })

  test('rejects non-managed api-key sessions for external users', () => {
    expect(
      hasChromeStartupEligibilitySession({
        buildMode: undefined,
        userType: undefined,
        session: {
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
          principalSource: 'direct_api_key_env',
          sessionState: 'usable',
          accessToken: null,
        },
      }),
    ).toBe(false)
  })
})
