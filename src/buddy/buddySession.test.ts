import { describe, expect, it } from 'bun:test'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'
import { resolveBuddyReactionSession } from './buddySession.js'

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

describe('buddySession', () => {
  it('accepts canonical managed bearer sessions with an org UUID', () => {
    expect(
      resolveBuddyReactionSession(
        makeSession({
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
          hasUsableToken: true,
          accessToken: 'managed-access-token',
          identity: {
            email: 'xjdr@noumena.net',
            accountUuid: 'acct',
            organizationUuid: 'org',
            organizationName: 'org',
          },
        }),
      ),
    ).toEqual({
      accessToken: 'managed-access-token',
      organizationUuid: 'org',
    })
  })

  it('rejects service bearer sessions without a managed principal', () => {
    expect(
      resolveBuddyReactionSession(
        makeSession({
          principalKind: 'service_principal',
          principalSource: 'service_oauth_env',
          sessionState: 'usable',
          headersKind: 'bearer',
          providerAuthKind: 'noumena_first_party',
          providerPlan: {
            mode: 'noumena_managed',
            source: 'service_credential',
            staticKeyEnvVarName: null,
          },
          hasUsableToken: true,
          accessToken: 'service-token',
          identity: {
            email: null,
            accountUuid: null,
            organizationUuid: 'org',
            organizationName: 'org',
          },
        }),
      ),
    ).toBeNull()
  })
})
