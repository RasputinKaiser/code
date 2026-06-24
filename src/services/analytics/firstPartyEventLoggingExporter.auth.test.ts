import { describe, expect, it } from 'bun:test'
import type { ResolvedAuthSession } from 'src/auth/runtime/types.js'
import { shouldSkipFirstPartyEventLoggingAuthForSession } from './firstPartyEventLoggingExporter.js'

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
    scopes: ['user:profile', 'user:inference'],
    hasUsableToken: true,
    hasUsableApiKey: false,
    accessToken: 'oauth-token',
    accessTokenExpiresAt: Date.now() + 10 * 60_000,
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

describe('firstPartyEventLoggingExporter canonical auth gating', () => {
  it('uses auth for oauth-backed first-party sessions with trust and profile scope', () => {
    expect(
      shouldSkipFirstPartyEventLoggingAuthForSession(makeSession(), {
        skipAuth: false,
        hasTrust: true,
      }),
    ).toBe(false)
  })

  it('skips auth for oauth-backed sessions without profile scope or with expired tokens', () => {
    expect(
      shouldSkipFirstPartyEventLoggingAuthForSession(
        makeSession({
          principalKind: 'service_principal',
          principalSource: 'service_oauth_env',
          scopes: ['user:inference'],
          rawAuthTokenSource: 'NCODE_OAUTH_TOKEN',
        }),
        {
          skipAuth: false,
          hasTrust: true,
        },
      ),
    ).toBe(true)

    expect(
      shouldSkipFirstPartyEventLoggingAuthForSession(
        makeSession({
          accessTokenExpiresAt: Date.now() - 60_000,
        }),
        {
          skipAuth: false,
          hasTrust: true,
        },
      ),
    ).toBe(true)
  })

  it('does not force auth skipping for direct api-key sessions when trust exists', () => {
    expect(
      shouldSkipFirstPartyEventLoggingAuthForSession(
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
        {
          skipAuth: false,
          hasTrust: true,
        },
      ),
    ).toBe(false)
  })

  it('always skips auth when explicitly disabled or trust is unavailable', () => {
    expect(
      shouldSkipFirstPartyEventLoggingAuthForSession(makeSession(), {
        skipAuth: true,
        hasTrust: true,
      }),
    ).toBe(true)
    expect(
      shouldSkipFirstPartyEventLoggingAuthForSession(makeSession(), {
        skipAuth: false,
        hasTrust: false,
      }),
    ).toBe(true)
  })
})
