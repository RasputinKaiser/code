import { describe, expect, it } from 'bun:test'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'
import { buildRateLimitUiSessionState } from './rateLimitUiSession.js'

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

describe('rateLimitUiSession canonical runtime helpers', () => {
  it('treats oauth-backed first-party sessions as managed rate-limit UI sessions', () => {
    expect(buildRateLimitUiSessionState(makeSession())).toEqual({
      subscriptionType: 'team',
      rateLimitTier: 'default_claude_max_20x',
      isOauthBackedFirstPartySession: true,
      isTeamOrEnterprise: true,
    })
  })

  it('does not treat direct api-key sessions as managed rate-limit UI sessions', () => {
    expect(
      buildRateLimitUiSessionState(
        makeSession({
          principalKind: 'api_key_user',
          principalSource: 'direct_api_key_env',
          headersKind: 'api_key',
          providerPlan: {
            mode: 'noumena_managed',
            source: 'direct_api_key_env',
            staticKeyEnvVarName: 'NOUMENA_API_KEY',
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
      rateLimitTier: null,
      isOauthBackedFirstPartySession: false,
      isTeamOrEnterprise: false,
    })
  })

  it('does not treat static BYOK env-key sessions as managed rate-limit UI sessions', () => {
    expect(
      buildRateLimitUiSessionState(
        makeSession({
          principalKind: 'api_key_user',
          principalSource: 'direct_api_key_env',
          headersKind: 'api_key',
          providerAuthKind: 'none',
          providerPlan: {
            mode: 'byok_static_env',
            source: 'byok_static_env',
            staticKeyEnvVarName: 'ANTHROPIC_API_KEY',
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
      rateLimitTier: null,
      isOauthBackedFirstPartySession: false,
      isTeamOrEnterprise: false,
    })
  })
})
