import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { getAuthRuntime } from 'src/auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from 'src/auth/runtime/types.js'
import {
  getCurrentOauthBackedInferenceAccountUuid,
  getCurrentOauthBackedFirstPartyInferenceSession,
  isOauthBackedFirstPartyInferenceSession,
} from './firstPartyInferenceSession.js'

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
    scopes: ['user:profile', 'user:inference'],
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

function withMockCurrentSession<T>(
  session: ResolvedAuthSession,
  fn: () => T,
): T {
  const runtime = getAuthRuntime()
  const originalGetCurrentSession = runtime.getCurrentSession.bind(runtime)
  ;(
    runtime as {
      getCurrentSession: typeof runtime.getCurrentSession
    }
  ).getCurrentSession = () => session

  try {
    return fn()
  } finally {
    ;(
      runtime as {
        getCurrentSession: typeof runtime.getCurrentSession
      }
    ).getCurrentSession = originalGetCurrentSession
  }
}

beforeEach(() => {
  delete process.env.NOUMENA_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN
})

afterEach(() => {
  delete process.env.NOUMENA_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN
})

describe('firstPartyInferenceSession', () => {
  it('treats oauth-backed Noumena bearer sessions as first-party inference sessions', () => {
    expect(
      isOauthBackedFirstPartyInferenceSession(makeSession()),
    ).toBe(true)
  })

  it('rejects direct API-key sessions as first-party inference sessions', () => {
    expect(
      isOauthBackedFirstPartyInferenceSession(
        makeSession({
          principalKind: 'api_key_user',
          principalSource: 'direct_api_key_env',
          headersKind: 'api_key',
          providerAuthKind: 'noumena_first_party',
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

  it('rejects static BYOK env-key sessions as first-party inference sessions', () => {
    expect(
      isOauthBackedFirstPartyInferenceSession(
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

  it('returns the current oauth-backed first-party session and account uuid', () => {
    const session = makeSession()

    const resolvedSession = withMockCurrentSession(session, () =>
      getCurrentOauthBackedFirstPartyInferenceSession(),
    )
    const accountUuid = withMockCurrentSession(session, () =>
      getCurrentOauthBackedInferenceAccountUuid(),
    )

    expect(resolvedSession).toEqual(session)
    expect(accountUuid).toBe('acct-123')
  })

  it('returns no current session or account uuid for direct API-key sessions', () => {
    const session = makeSession({
      principalKind: 'api_key_user',
      principalSource: 'direct_api_key_env',
      headersKind: 'api_key',
      providerAuthKind: 'noumena_first_party',
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
    })

    expect(
      withMockCurrentSession(session, () =>
        getCurrentOauthBackedFirstPartyInferenceSession(),
      ),
    ).toBeNull()
    expect(
      withMockCurrentSession(session, () =>
        getCurrentOauthBackedInferenceAccountUuid(),
      ),
    ).toBe('')
  })
})
