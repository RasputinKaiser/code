import { describe, expect, it } from 'bun:test'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'
import { buildExtraUsageSessionState } from './extraUsageSession.js'

function makeSession(
  overrides: Partial<ResolvedAuthSession> = {},
): ResolvedAuthSession {
  return {
    principalKind: 'noumena_account',
    principalSource: 'managed_oauth',
    sessionState: 'usable',
    headersKind: 'bearer',
    providerAuthKind: 'noumena_first_party',
    providerPlan: {
      mode: 'noumena_managed',
      source: 'managed_principal',
      staticKeyEnvVarName: null,
    },
    isInteractive: true,
    canRefresh: true,
    canReauthenticateInteractively: true,
    identity: {
      email: 'user@example.com',
      accountUuid: 'acct-123',
      organizationUuid: 'org-123',
      organizationName: 'Test Org',
    },
    subscription: {
      subscriptionName: 'Noumena Team',
      subscriptionType: 'team',
      rateLimitTier: 'default_claude_max_20x',
    },
    scopes: ['user:profile', 'user:inference'],
    hasUsableToken: true,
    hasUsableApiKey: false,
    accessToken: 'oauth-token',
    accessTokenExpiresAt: Date.now() + 60_000,
    refreshTokenPresent: true,
    apiKey: null,
    rawAuthTokenSource: 'noumena.com',
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

describe('extra usage canonical session helpers', () => {
  it('treats team and enterprise sessions as team-or-enterprise sessions', () => {
    expect(buildExtraUsageSessionState(makeSession())).toEqual({
      subscriptionType: 'team',
      isTeamOrEnterprise: true,
    })

    expect(
      buildExtraUsageSessionState(
        makeSession({
          subscription: {
            subscriptionName: 'Noumena Enterprise',
            subscriptionType: 'enterprise',
            rateLimitTier: 'default_claude_max_20x',
          },
        }),
      ),
    ).toEqual({
      subscriptionType: 'enterprise',
      isTeamOrEnterprise: true,
    })
  })

  it('does not treat api-key or BYOK sessions as team-or-enterprise sessions', () => {
    expect(
      buildExtraUsageSessionState(
        makeSession({
          principalKind: 'api_key_user',
          principalSource: 'direct_api_key_env',
          headersKind: 'api_key',
          providerPlan: {
            mode: 'noumena_managed',
            source: 'direct_api_key_env',
            staticKeyEnvVarName: 'NOUMENA_API_KEY',
          },
          subscription: {
            subscriptionName: null,
            subscriptionType: null,
            rateLimitTier: null,
          },
          scopes: [],
          hasUsableToken: false,
          hasUsableApiKey: true,
          accessToken: null,
          accessTokenExpiresAt: null,
          refreshTokenPresent: false,
          apiKey: 'api-key',
          rawAuthTokenSource: null,
          rawApiKeySource: 'NOUMENA_API_KEY',
        }),
      ),
    ).toEqual({
      subscriptionType: null,
      isTeamOrEnterprise: false,
    })

    expect(
      buildExtraUsageSessionState(
        makeSession({
          principalKind: 'api_key_user',
          principalSource: 'direct_api_key_env',
          headersKind: 'api_key',
          providerAuthKind: 'byok_static_env',
          providerPlan: {
            mode: 'byok_static_env',
            source: 'direct_api_key_env',
            staticKeyEnvVarName: 'ANTHROPIC_API_KEY',
          },
          subscription: {
            subscriptionName: null,
            subscriptionType: null,
            rateLimitTier: null,
          },
          scopes: [],
          hasUsableToken: false,
          hasUsableApiKey: true,
          accessToken: null,
          accessTokenExpiresAt: null,
          refreshTokenPresent: false,
          apiKey: 'byok-key',
          rawAuthTokenSource: null,
          rawApiKeySource: 'ANTHROPIC_API_KEY',
        }),
      ),
    ).toEqual({
      subscriptionType: null,
      isTeamOrEnterprise: false,
    })
  })
})
