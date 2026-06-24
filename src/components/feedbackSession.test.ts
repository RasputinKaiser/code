import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { OAUTH_BETA_HEADER } from '../constants/oauth.js'
import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'
import { resolveFeedbackAuthHeaders } from './feedbackSession.js'

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
      email: 'user@noumena.net',
      accountUuid: 'acct-1',
      organizationUuid: 'org-1',
      organizationName: 'Noumena',
    },
    subscription: {
      subscriptionName: 'Noumena Max',
      subscriptionType: 'max',
      rateLimitTier: 'tier-1',
    },
    scopes: ['user:inference'],
    hasUsableToken: true,
    hasUsableApiKey: false,
    accessToken: 'managed-token',
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

describe('resolveFeedbackAuthHeaders', () => {
  const runtime = getAuthRuntime() as {
    resolveSession: (options?: { allowRefresh?: boolean }) => Promise<ResolvedAuthSession>
    getCurrentSession: () => ResolvedAuthSession
  }
  const originalResolveSession = runtime.resolveSession
  const originalGetCurrentSession = runtime.getCurrentSession

  beforeEach(() => {
    runtime.resolveSession = mock(async () => makeSession())
    runtime.getCurrentSession = mock(() => makeSession())
  })

  afterEach(() => {
    runtime.resolveSession = originalResolveSession
    runtime.getCurrentSession = originalGetCurrentSession
    mock.restore()
  })

  test('refreshes the canonical session before reading managed headers', async () => {
    expect(await resolveFeedbackAuthHeaders()).toEqual({
      headers: {
        Authorization: 'Bearer managed-token',
        'anthropic-beta': OAUTH_BETA_HEADER,
      },
    })
    expect(runtime.resolveSession).toHaveBeenCalledWith({ allowRefresh: true })
  })

  test('returns canonical api key headers for console sessions', async () => {
    runtime.getCurrentSession = mock(() =>
      makeSession({
        principalKind: 'noumena_account',
        principalSource: 'console_api_key',
        headersKind: 'api_key',
        hasUsableToken: false,
        hasUsableApiKey: true,
        accessToken: null,
        apiKey: 'console-key',
        rawAuthTokenSource: null,
        rawApiKeySource: '/login managed key',
      }),
    )

    expect(await resolveFeedbackAuthHeaders()).toEqual({
      headers: {
        'x-api-key': 'console-key',
      },
    })
  })
})
