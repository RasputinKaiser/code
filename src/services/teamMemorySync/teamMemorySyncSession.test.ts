import { describe, expect, it } from 'bun:test'
import type { ResolvedAuthSession } from 'src/auth/runtime/types.js'
import { hasUsableTeamMemorySyncSession } from './teamMemorySyncSession.js'

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
      subscriptionName: 'Noumena Max',
      subscriptionType: 'max',
      rateLimitTier: 'tier-1',
    },
    scopes: ['user:inference', 'user:profile'],
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

describe('teamMemorySyncSession', () => {
  it('accepts oauth-backed first-party bearer sessions with inference and profile scopes', () => {
    expect(hasUsableTeamMemorySyncSession(makeSession())).toBe(true)
  })

  it('rejects bearer sessions without profile scope', () => {
    expect(
      hasUsableTeamMemorySyncSession(
        makeSession({
          scopes: ['user:inference'],
        }),
      ),
    ).toBe(false)
  })

  it('rejects direct API-key sessions', () => {
    expect(
      hasUsableTeamMemorySyncSession(
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
  })

  it('rejects service bearer sessions that only have inference scope', () => {
    expect(
      hasUsableTeamMemorySyncSession(
        makeSession({
          principalKind: 'service_principal',
          principalSource: 'service_oauth_env',
          scopes: ['user:inference'],
          sourceDetails: {
            usedLegacyCompat: true,
            usedEnvVar: true,
            usedFileDescriptor: false,
            usedHelper: false,
          },
        }),
      ),
    ).toBe(false)
  })
})
