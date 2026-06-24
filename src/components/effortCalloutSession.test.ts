import { describe, expect, it } from 'bun:test'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'
import { getEffortCalloutDecision } from './effortCalloutSession.js'

function makeSession(
  overrides: Partial<ResolvedAuthSession>,
): ResolvedAuthSession {
  return {
    principalKind: 'none',
    principalSource: 'none',
    sessionState: 'unauthenticated',
    headersKind: 'none',
    providerAuthKind: 'none',
    providerPlan: {
      mode: 'none',
      source: 'none',
      staticKeyEnvVarName: null,
    },
    isInteractive: true,
    canRefresh: false,
    canReauthenticateInteractively: false,
    identity: {
      email: null,
      accountUuid: null,
      organizationUuid: null,
      organizationName: null,
    },
    subscription: {
      subscriptionName: null,
      subscriptionType: null,
      rateLimitTier: null,
    },
    scopes: [],
    hasUsableToken: false,
    hasUsableApiKey: false,
    accessToken: null,
    accessTokenExpiresAt: null,
    refreshTokenPresent: false,
    apiKey: null,
    rawAuthTokenSource: null,
    rawApiKeySource: null,
    recoveryAction: 'none',
    recoveryMessage: null,
    sourceDetails: {
      usedLegacyCompat: false,
      usedEnvVar: false,
      usedFileDescriptor: false,
      usedHelper: false,
    },
    ...overrides,
  }
}

const baseConfig = {
  effortCalloutV2Dismissed: false,
  numStartups: 2,
  effortCalloutDismissed: false,
}

describe('effortCalloutSession', () => {
  it('shows the callout for pro oauth-backed sessions when enabled', () => {
    const decision = getEffortCalloutDecision(
      'opus-4-6-20260101',
      baseConfig,
      makeSession({
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
      }),
      true,
    )

    expect(decision).toEqual({
      shouldShow: true,
      shouldMarkV2Dismissed: false,
    })
  })

  it('marks brand-new users dismissed instead of showing the callout', () => {
    const decision = getEffortCalloutDecision(
      'opus-4-6-20260101',
      {
        ...baseConfig,
        numStartups: 1,
      },
      makeSession({}),
      true,
    )

    expect(decision).toEqual({
      shouldShow: false,
      shouldMarkV2Dismissed: true,
    })
  })

  it('keeps team sessions pending when the config is disabled', () => {
    const decision = getEffortCalloutDecision(
      'opus-4-6-20260101',
      baseConfig,
      makeSession({
        headersKind: 'bearer',
        providerPlan: {
          mode: 'noumena_managed',
          source: 'managed_principal',
          staticKeyEnvVarName: null,
        },
        scopes: ['user:inference', 'user:profile'],
        subscription: {
          subscriptionName: 'Noumena Team',
          subscriptionType: 'team',
          rateLimitTier: 'tier-1',
        },
      }),
      false,
    )

    expect(decision).toEqual({
      shouldShow: false,
      shouldMarkV2Dismissed: false,
    })
  })

  it('marks non-subscriber api-key sessions dismissed', () => {
    const decision = getEffortCalloutDecision(
      'opus-4-6-20260101',
      baseConfig,
      makeSession({
        principalKind: 'api_key_user',
        principalSource: 'direct_api_key_env',
        sessionState: 'usable',
        headersKind: 'api_key',
        providerAuthKind: 'byok_static_env',
        providerPlan: {
          mode: 'byok_static_env',
          source: 'direct_api_key_env',
          staticKeyEnvVarName: 'ANTHROPIC_API_KEY',
        },
        hasUsableApiKey: true,
        apiKey: 'byok-key',
        rawApiKeySource: 'ANTHROPIC_API_KEY',
      }),
      true,
    )

    expect(decision).toEqual({
      shouldShow: false,
      shouldMarkV2Dismissed: true,
    })
  })
})
