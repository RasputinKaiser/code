import { describe, expect, it } from 'bun:test'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'
import {
  buildOAuthRefreshStatusReport,
  buildOAuthRefreshSessionState,
  getOAuthRefreshRequestedScopes,
} from './oauthRefreshSession.js'

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

describe('oauthRefreshSession', () => {
  it('builds a managed oauth status report from canonical session truth', () => {
    const now = 1_700_000_000_000
    const originalDateNow = Date.now
    Date.now = () => now
    try {
      const report = buildOAuthRefreshStatusReport(
        makeSession({
          principalSource: 'managed_oauth',
          headersKind: 'bearer',
          accessToken: 'access-token',
          accessTokenExpiresAt: now + 60_000,
          refreshTokenPresent: true,
          scopes: ['user:inference', 'user:profile'],
          identity: {
            email: 'xjdr@noumena.net',
            accountUuid: 'acct',
            organizationUuid: 'org',
            organizationName: 'org',
          },
          rawAuthTokenSource: 'managed-session',
        }),
      )

      expect(report).toContain('- auth source: managed-session')
      expect(report).toContain('- oauth token: present')
      expect(report).toContain('- refresh token: present')
      expect(report).toContain('- scopes: user:inference, user:profile')
      expect(report).toContain('- account: xjdr@noumena.net')
      expect(report).toContain('- org: org')
    } finally {
      Date.now = originalDateNow
    }
  })

  it('reports missing oauth for API-key sessions', () => {
    expect(
      buildOAuthRefreshSessionState(
        makeSession({
          principalKind: 'api_key_user',
          principalSource: 'direct_api_key_env',
          headersKind: 'api_key',
          providerPlan: {
            mode: 'noumena_managed',
            source: 'direct_api_key_env',
            staticKeyEnvVarName: 'NOUMENA_API_KEY',
          },
          apiKey: 'key',
          hasUsableApiKey: true,
          rawApiKeySource: 'NOUMENA_API_KEY',
        }),
      ),
    ).toMatchObject({
      source: 'direct_api_key_env',
      hasOAuthAccessToken: false,
      hasRefreshToken: false,
    })
  })

  it('preserves injected oauth source labels', () => {
    expect(
      buildOAuthRefreshSessionState(
        makeSession({
          principalKind: 'service_principal',
          principalSource: 'service_oauth_env',
          headersKind: 'bearer',
          accessToken: 'service-token',
          rawAuthTokenSource: 'CLAUDE_CODE_OAUTH_TOKEN',
        }),
      ).source,
    ).toBe('CLAUDE_CODE_OAUTH_TOKEN')
  })

  it('omits requested scopes when the canonical session already has inference scope', () => {
    expect(
      getOAuthRefreshRequestedScopes(
        makeSession({
          scopes: ['user:inference', 'user:profile'],
        }),
      ),
    ).toBeUndefined()
  })

  it('preserves explicit requested scopes for non-inference refresh sessions', () => {
    expect(
      getOAuthRefreshRequestedScopes(
        makeSession({
          scopes: ['user:profile'],
        }),
      ),
    ).toEqual(['user:profile'])
  })
})
