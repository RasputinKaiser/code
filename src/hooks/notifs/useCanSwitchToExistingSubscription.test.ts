import { describe, expect, test } from 'bun:test'
import {
  shouldCheckForExistingSubscriptionNotice,
} from './useCanSwitchToExistingSubscription.js'
import type { CommandAvailabilitySession } from 'src/utils/commandAvailability.js'

function makeOauthSession(): NonNullable<CommandAvailabilitySession> {
  return {
    headersKind: 'bearer',
    providerPlan: {
      mode: 'noumena_managed',
      source: 'managed_principal',
      staticKeyEnvVarName: null,
    },
    scopes: ['user:inference'],
    subscription: {
      subscriptionName: 'Max',
      subscriptionType: 'max',
      rateLimitTier: 'default',
    },
  }
}

function makeApiKeySession(): NonNullable<CommandAvailabilitySession> {
  return {
    headersKind: 'api_key',
    providerPlan: {
      mode: 'noumena_managed',
      source: 'direct_api_key_env',
      staticKeyEnvVarName: 'NOUMENA_API_KEY',
    },
    scopes: [],
    subscription: {
      subscriptionName: null,
      subscriptionType: null,
      rateLimitTier: null,
    },
  }
}

describe('shouldCheckForExistingSubscriptionNotice', () => {
  test('skips the notice when already using oauth-backed managed auth', () => {
    expect(shouldCheckForExistingSubscriptionNotice(makeOauthSession())).toBe(
      false,
    )
  })

  test('checks for existing subscriptions for direct API-key sessions', () => {
    expect(shouldCheckForExistingSubscriptionNotice(makeApiKeySession())).toBe(
      true,
    )
  })

  test('checks for existing subscriptions when no session is present', () => {
    expect(shouldCheckForExistingSubscriptionNotice(null)).toBe(true)
  })
})
