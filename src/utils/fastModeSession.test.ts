import { describe, expect, it } from 'bun:test'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'
import {
  getFastModeUnavailableReasonAuthType,
  resolveFastModeFetchAuth,
} from './fastModeSession.js'

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

describe('fastModeSession', () => {
  it('treats bearer sessions as oauth for unavailable-reason messaging', () => {
    expect(
      getFastModeUnavailableReasonAuthType(
        makeSession({
          headersKind: 'bearer',
          accessToken: 'access-token',
        }),
      ),
    ).toBe('oauth')
  })

  it('uses profile-scoped oauth when available for fast-mode fetches', () => {
    expect(
      resolveFastModeFetchAuth(
        makeSession({
          headersKind: 'bearer',
          hasUsableToken: true,
          accessToken: 'access-token',
          scopes: ['user:inference', 'user:profile'],
        }),
      ),
    ).toEqual({ accessToken: 'access-token' })
  })

  it('falls back to api-key auth when bearer lacks profile scope', () => {
    expect(
      resolveFastModeFetchAuth(
        makeSession({
          headersKind: 'api_key',
          hasUsableApiKey: true,
          apiKey: 'api-key',
        }),
      ),
    ).toEqual({ apiKey: 'api-key' })
  })

  it('rejects service bearer sessions without profile scope', () => {
    expect(
      resolveFastModeFetchAuth(
        makeSession({
          headersKind: 'bearer',
          hasUsableToken: true,
          accessToken: 'service-token',
          scopes: ['user:inference'],
        }),
      ),
    ).toBeNull()
  })
})
