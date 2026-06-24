import { describe, expect, it } from 'bun:test'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'
import { hasIncludedUltrareview } from './reviewRemoteSession.js'

function makeSession(
  overrides: Partial<ResolvedAuthSession> = {},
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

describe('reviewRemoteSession', () => {
  it('treats oauth-backed team sessions as included ultrareview', () => {
    expect(
      hasIncludedUltrareview(
        makeSession({
          headersKind: 'bearer',
          providerPlan: {
            mode: 'noumena_managed',
            source: 'managed_principal',
            staticKeyEnvVarName: null,
          },
          scopes: ['user:inference'],
          subscription: {
            subscriptionName: 'Noumena Team',
            subscriptionType: 'team',
            rateLimitTier: 'default',
          },
        }),
      ),
    ).toBe(true)
  })

  it('treats oauth-backed enterprise sessions as included ultrareview', () => {
    expect(
      hasIncludedUltrareview(
        makeSession({
          headersKind: 'bearer',
          providerPlan: {
            mode: 'noumena_managed',
            source: 'managed_principal',
            staticKeyEnvVarName: null,
          },
          scopes: ['user:inference'],
          subscription: {
            subscriptionName: 'Noumena Enterprise',
            subscriptionType: 'enterprise',
            rateLimitTier: 'enterprise',
          },
        }),
      ),
    ).toBe(true)
  })

  it('does not treat API-key sessions as included ultrareview', () => {
    expect(
      hasIncludedUltrareview(
        makeSession({
          principalKind: 'api_key_user',
          principalSource: 'direct_api_key_env',
          sessionState: 'usable',
          headersKind: 'api_key',
          providerAuthKind: 'noumena_first_party',
          providerPlan: {
            mode: 'noumena_managed',
            source: 'direct_api_key_env',
            staticKeyEnvVarName: 'NOUMENA_API_KEY',
          },
          hasUsableApiKey: true,
          apiKey: 'key',
          rawApiKeySource: 'NOUMENA_API_KEY',
          subscription: {
            subscriptionName: 'Noumena Team',
            subscriptionType: 'team',
            rateLimitTier: 'default',
          },
        }),
      ),
    ).toBe(false)
  })
})
