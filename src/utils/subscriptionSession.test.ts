import { describe, expect, it } from 'bun:test'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'
import {
  buildSubscriptionSessionState,
  shouldShowAgentConcurrencyNote,
} from './subscriptionSession.js'

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

describe('subscriptionSession', () => {
  it('treats oauth-backed first-party sessions with unknown tier as Noumena Managed', () => {
    const session = makeSession({
      headersKind: 'bearer',
      providerPlan: {
        mode: 'noumena_managed',
        source: 'service_credential',
        staticKeyEnvVarName: null,
      },
      scopes: ['user:inference'],
    })

    expect(buildSubscriptionSessionState(session)).toEqual({
      subscriptionName: null,
      subscriptionDisplayName: 'Noumena Managed',
      subscriptionType: null,
      rateLimitTier: null,
      isOauthBackedFirstPartySession: true,
      isMaxSubscriber: false,
      isTeamSubscriber: false,
      isEnterpriseSubscriber: false,
      isTeamPremiumSubscriber: false,
      isProSubscriber: false,
    })
  })

  it('derives team premium from canonical rate-limit tier', () => {
    const session = makeSession({
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
        rateLimitTier: 'default_claude_max_5x',
      },
    })

    expect(buildSubscriptionSessionState(session)).toMatchObject({
      subscriptionDisplayName: 'Noumena Team',
      isOauthBackedFirstPartySession: true,
      isTeamSubscriber: true,
      isEnterpriseSubscriber: false,
      isTeamPremiumSubscriber: true,
    })
  })

  it('keeps direct API-key sessions out of oauth-backed subscription logic', () => {
    const session = makeSession({
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
    })

    expect(buildSubscriptionSessionState(session)).toMatchObject({
      subscriptionDisplayName: null,
      isOauthBackedFirstPartySession: false,
      isMaxSubscriber: false,
      isTeamSubscriber: false,
      isEnterpriseSubscriber: false,
      isTeamPremiumSubscriber: false,
      isProSubscriber: false,
    })
  })

  it('derives enterprise from canonical subscription type', () => {
    const session = makeSession({
      headersKind: 'bearer',
      providerPlan: {
        mode: 'noumena_managed',
        source: 'managed_principal',
        staticKeyEnvVarName: null,
      },
      scopes: ['user:inference', 'user:profile'],
      subscription: {
        subscriptionName: 'Noumena Enterprise',
        subscriptionType: 'enterprise',
        rateLimitTier: 'enterprise-tier',
      },
    })

    expect(buildSubscriptionSessionState(session)).toMatchObject({
      subscriptionDisplayName: 'Noumena Enterprise',
      isOauthBackedFirstPartySession: true,
      isTeamSubscriber: false,
      isEnterpriseSubscriber: true,
      isTeamPremiumSubscriber: false,
    })
  })

  it('hides the agent concurrency note only for pro oauth-backed sessions', () => {
    const proSession = makeSession({
      headersKind: 'bearer',
      providerPlan: {
        mode: 'noumena_managed',
        source: 'managed_principal',
        staticKeyEnvVarName: null,
      },
      scopes: ['user:inference'],
      subscription: {
        subscriptionName: 'Noumena Pro',
        subscriptionType: 'pro',
        rateLimitTier: 'tier-1',
      },
    })
    const byokSession = makeSession({
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
    })

    expect(shouldShowAgentConcurrencyNote(proSession)).toBe(false)
    expect(shouldShowAgentConcurrencyNote(byokSession)).toBe(true)
  })
})
