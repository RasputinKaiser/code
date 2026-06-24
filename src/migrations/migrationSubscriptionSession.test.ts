import { describe, expect, test } from 'bun:test'

import {
  shouldRunResetProToOpusDefaultMigration,
  shouldRunSonnet45To46Migration,
} from './migrationSubscriptionSession.js'

describe('migrationSubscriptionSession', () => {
  test('enables Sonnet 4.5 to 4.6 migration only for eligible first-party oauth subscriptions', () => {
    const baseManaged = {
      providerPlan: { mode: 'noumena_managed' as const },
      headersKind: 'bearer' as const,
      scopes: ['user:inference'],
    }

    expect(
      shouldRunSonnet45To46Migration(
        {
          ...baseManaged,
          subscription: {
            subscriptionName: 'Pro',
            subscriptionType: 'pro',
            rateLimitTier: null,
          },
        },
        'firstParty',
      ),
    ).toBe(true)

    expect(
      shouldRunSonnet45To46Migration(
        {
          ...baseManaged,
          subscription: {
            subscriptionName: 'Max',
            subscriptionType: 'max',
            rateLimitTier: null,
          },
        },
        'firstParty',
      ),
    ).toBe(true)

    expect(
      shouldRunSonnet45To46Migration(
        {
          ...baseManaged,
          subscription: {
            subscriptionName: 'Team',
            subscriptionType: 'team',
            rateLimitTier: 'default_claude_max_5x',
          },
        },
        'firstParty',
      ),
    ).toBe(true)

    expect(
      shouldRunSonnet45To46Migration(
        {
          providerPlan: { mode: 'noumena_managed' as const },
          headersKind: 'api_key' as const,
          scopes: [],
          subscription: {
            subscriptionName: null,
            subscriptionType: null,
            rateLimitTier: null,
          },
        },
        'firstParty',
      ),
    ).toBe(false)

    expect(
      shouldRunSonnet45To46Migration(
        {
          ...baseManaged,
          subscription: {
            subscriptionName: 'Pro',
            subscriptionType: 'pro',
            rateLimitTier: null,
          },
        },
        'vertex',
      ),
    ).toBe(false)
  })

  test('enables the opus default reset only for first-party pro oauth subscriptions', () => {
    expect(
      shouldRunResetProToOpusDefaultMigration(
        {
          providerPlan: { mode: 'noumena_managed' as const },
          headersKind: 'bearer' as const,
          scopes: ['user:inference'],
          subscription: {
            subscriptionName: 'Pro',
            subscriptionType: 'pro',
            rateLimitTier: null,
          },
        },
        'firstParty',
      ),
    ).toBe(true)

    expect(
      shouldRunResetProToOpusDefaultMigration(
        {
          providerPlan: { mode: 'noumena_managed' as const },
          headersKind: 'bearer' as const,
          scopes: ['user:inference'],
          subscription: {
            subscriptionName: 'Max',
            subscriptionType: 'max',
            rateLimitTier: null,
          },
        },
        'firstParty',
      ),
    ).toBe(false)

    expect(
      shouldRunResetProToOpusDefaultMigration(
        {
          providerPlan: { mode: 'noumena_managed' as const },
          headersKind: 'api_key' as const,
          scopes: [],
          subscription: {
            subscriptionName: null,
            subscriptionType: null,
            rateLimitTier: null,
          },
        },
        'firstParty',
      ),
    ).toBe(false)
  })
})
