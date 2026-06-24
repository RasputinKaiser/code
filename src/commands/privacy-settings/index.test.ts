import { describe, expect, it } from 'bun:test'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'
import { isPrivacySettingsEnabledForSession } from './index.js'

type PrivacySettingsSession = Pick<
  ResolvedAuthSession,
  'headersKind' | 'providerPlan' | 'scopes' | 'subscription'
>

function makeSession(
  overrides: Partial<PrivacySettingsSession> = {},
): PrivacySettingsSession {
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

describe('/privacy-settings command gating', () => {
  it('is enabled for managed consumer subscriptions', () => {
    expect(isPrivacySettingsEnabledForSession(makeSession())).toBe(true)

    expect(
      isPrivacySettingsEnabledForSession(
        makeSession({
          subscription: {
            subscriptionName: 'Noumena Max',
            subscriptionType: 'max',
            rateLimitTier: 'tier-1',
          },
        }),
      ),
    ).toBe(true)
  })

  it('is disabled for non-consumer or non-managed sessions', () => {
    expect(
      isPrivacySettingsEnabledForSession(
        makeSession({
          subscription: {
            subscriptionName: 'Noumena Team',
            subscriptionType: 'team',
            rateLimitTier: 'tier-1',
          },
        }),
      ),
    ).toBe(false)

    expect(
      isPrivacySettingsEnabledForSession(
        makeSession({
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
      ),
    ).toBe(false)

    expect(
      isPrivacySettingsEnabledForSession(
        makeSession({
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
      ),
    ).toBe(false)
  })
})
