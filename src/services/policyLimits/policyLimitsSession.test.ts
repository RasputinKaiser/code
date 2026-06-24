import { describe, expect, it } from 'bun:test'
import type { ResolvedAuthSession } from 'src/auth/runtime/types.js'
import {
  hasUsablePolicyLimitsApiKeySession,
  hasUsablePolicyLimitsBearerSession,
  isEligiblePolicyLimitsOauthSession,
} from './policyLimitsSession.js'

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
      rateLimitTier: 'tier-1',
    },
    scopes: ['user:inference'],
    hasUsableToken: true,
    hasUsableApiKey: false,
    accessToken: 'oauth-token',
    accessTokenExpiresAt: Date.now() + 10 * 60 * 1_000,
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

describe('policyLimitsSession', () => {
  it('accepts oauth-backed first-party bearer sessions as usable bearer sessions', () => {
    expect(hasUsablePolicyLimitsBearerSession(makeSession())).toBe(true)
  })

  it('rejects direct api-key and static BYOK sessions as bearer sessions', () => {
    expect(
      hasUsablePolicyLimitsBearerSession(
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
    ).toBe(false)
    expect(
      hasUsablePolicyLimitsBearerSession(
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
    ).toBe(false)
  })

  it('requires team or enterprise subscriptions for oauth eligibility', () => {
    expect(isEligiblePolicyLimitsOauthSession(makeSession())).toBe(true)
    expect(
      isEligiblePolicyLimitsOauthSession(
        makeSession({
          subscription: {
            subscriptionName: 'Noumena Max',
            subscriptionType: 'max',
            rateLimitTier: 'tier-1',
          },
        }),
      ),
    ).toBe(false)
  })

  it('accepts non-helper API-key sessions and rejects apiKeyHelper placeholders', () => {
    expect(
      hasUsablePolicyLimitsApiKeySession(
        makeSession({
          principalKind: 'noumena_account',
          principalSource: 'console_api_key',
          headersKind: 'api_key',
          hasUsableToken: false,
          hasUsableApiKey: true,
          accessToken: null,
          accessTokenExpiresAt: null,
          refreshTokenPresent: false,
          apiKey: 'managed-key',
          rawAuthTokenSource: null,
          rawApiKeySource: '/login managed key',
        }),
      ),
    ).toBe(true)

    expect(
      hasUsablePolicyLimitsApiKeySession(
        makeSession({
          principalKind: 'api_key_user',
          principalSource: 'api_key_helper',
          headersKind: 'bearer',
          hasUsableToken: false,
          hasUsableApiKey: false,
          accessToken: null,
          accessTokenExpiresAt: null,
          refreshTokenPresent: false,
          apiKey: null,
          rawAuthTokenSource: null,
          rawApiKeySource: 'apiKeyHelper',
        }),
      ),
    ).toBe(false)
  })
})
