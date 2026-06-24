import { describe, expect, it } from 'bun:test'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'
import { isExtraUsageAllowedForContext } from './index.js'

type ExtraUsageCommandSession = Pick<
  ResolvedAuthSession,
  'headersKind' | 'providerPlan' | 'scopes' | 'subscription'
>

function makeSession(
  overrides: Partial<ExtraUsageCommandSession> = {},
): ExtraUsageCommandSession {
  return {
    headersKind: 'bearer',
    providerPlan: {
      mode: 'noumena_managed',
      source: 'managed_principal',
      staticKeyEnvVarName: null,
    },
    scopes: ['user:inference', 'user:profile'],
    subscription: {
      subscriptionName: 'Noumena Pro',
      subscriptionType: 'pro',
      rateLimitTier: 'tier-1',
    },
    ...overrides,
  }
}

describe('/extra-usage command gating', () => {
  it('is disabled when the env kill switch is set', () => {
    expect(
      isExtraUsageAllowedForContext({
        isDisabledByEnv: true,
        session: makeSession(),
        billingType: 'stripe_subscription',
      }),
    ).toBe(false)
  })

  it('is enabled for oauth-backed first-party sessions with supported billing types', () => {
    expect(
      isExtraUsageAllowedForContext({
        isDisabledByEnv: false,
        session: makeSession(),
        billingType: 'stripe_subscription',
      }),
    ).toBe(true)

    expect(
      isExtraUsageAllowedForContext({
        isDisabledByEnv: false,
        session: makeSession(),
        billingType: 'google_play_subscription',
      }),
    ).toBe(true)
  })

  it('is disabled when the billing type is missing or unsupported', () => {
    expect(
      isExtraUsageAllowedForContext({
        isDisabledByEnv: false,
        session: makeSession(),
        billingType: null,
      }),
    ).toBe(false)

    expect(
      isExtraUsageAllowedForContext({
        isDisabledByEnv: false,
        session: makeSession(),
        billingType: 'invoice',
      }),
    ).toBe(false)
  })

  it('is disabled for API-key and BYOK sessions even with supported billing types', () => {
    expect(
      isExtraUsageAllowedForContext({
        isDisabledByEnv: false,
        session: makeSession({
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
        }),
        billingType: 'stripe_subscription',
      }),
    ).toBe(false)

    expect(
      isExtraUsageAllowedForContext({
        isDisabledByEnv: false,
        session: makeSession({
          headersKind: 'api_key',
          providerPlan: {
            mode: 'byok_static_env',
            source: 'direct_api_key_env',
            staticKeyEnvVarName: 'ANTHROPIC_API_KEY',
          },
          scopes: [],
          subscription: {
            subscriptionName: null,
            subscriptionType: null,
            rateLimitTier: null,
          },
        }),
        billingType: 'stripe_subscription',
      }),
    ).toBe(false)
  })
})
