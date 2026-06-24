import { describe, expect, it } from 'bun:test'
import type { ResolvedAuthSession } from 'src/auth/runtime/types.js'
import {
  hasUsableRemoteManagedSettingsApiKeySession,
  hasUsableRemoteManagedSettingsBearerSession,
  isEligibleRemoteManagedSettingsOauthSession,
} from './remoteManagedSettingsSession.js'

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
      subscriptionName: null,
      subscriptionType: null,
      rateLimitTier: null,
    },
    scopes: ['user:inference'],
    hasUsableToken: true,
    hasUsableApiKey: false,
    accessToken: 'oauth-token',
    accessTokenExpiresAt: Date.now() + 10 * 60 * 1_000,
    refreshTokenPresent: true,
    apiKey: null,
    rawAuthTokenSource: 'CLAUDE_CODE_OAUTH_TOKEN',
    rawApiKeySource: null,
    recoveryAction: 'none',
    recoveryMessage: null,
    sourceDetails: {
      usedLegacyCompat: true,
      usedEnvVar: true,
      usedFileDescriptor: false,
      usedHelper: false,
    },
    ...overrides,
  }
}

describe('remoteManagedSettingsSession', () => {
  it('accepts oauth-backed first-party bearer sessions as usable bearer sessions', () => {
    expect(
      hasUsableRemoteManagedSettingsBearerSession(makeSession()),
    ).toBe(true)
  })

  it('treats null, team, and enterprise subscription types as oauth-eligible', () => {
    expect(isEligibleRemoteManagedSettingsOauthSession(makeSession())).toBe(
      true,
    )
    expect(
      isEligibleRemoteManagedSettingsOauthSession(
        makeSession({
          subscription: {
            subscriptionName: 'Noumena Team',
            subscriptionType: 'team',
            rateLimitTier: 'tier-1',
          },
          principalSource: 'managed_oauth',
          rawAuthTokenSource: 'noumena.com',
          sourceDetails: {
            usedLegacyCompat: false,
            usedEnvVar: false,
            usedFileDescriptor: false,
            usedHelper: false,
          },
        }),
      ),
    ).toBe(true)
    expect(
      isEligibleRemoteManagedSettingsOauthSession(
        makeSession({
          subscription: {
            subscriptionName: 'Noumena Enterprise',
            subscriptionType: 'enterprise',
            rateLimitTier: 'tier-1',
          },
          principalSource: 'managed_oauth',
          rawAuthTokenSource: 'noumena.com',
          sourceDetails: {
            usedLegacyCompat: false,
            usedEnvVar: false,
            usedFileDescriptor: false,
            usedHelper: false,
          },
        }),
      ),
    ).toBe(true)
  })

  it('rejects unsupported oauth subscriptions and direct api-key sessions', () => {
    expect(
      isEligibleRemoteManagedSettingsOauthSession(
        makeSession({
          subscription: {
            subscriptionName: 'Noumena Max',
            subscriptionType: 'max',
            rateLimitTier: 'tier-1',
          },
          principalSource: 'managed_oauth',
          rawAuthTokenSource: 'noumena.com',
          sourceDetails: {
            usedLegacyCompat: false,
            usedEnvVar: false,
            usedFileDescriptor: false,
            usedHelper: false,
          },
        }),
      ),
    ).toBe(false)

    expect(
      hasUsableRemoteManagedSettingsBearerSession(
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

  it('accepts non-helper API-key sessions and rejects apiKeyHelper placeholders', () => {
    expect(
      hasUsableRemoteManagedSettingsApiKeySession(
        makeSession({
          principalKind: 'noumena_account',
          principalSource: 'console_api_key',
          headersKind: 'api_key',
          providerPlan: {
            mode: 'noumena_managed',
            source: 'console_api_key',
            staticKeyEnvVarName: null,
          },
          scopes: [],
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
      hasUsableRemoteManagedSettingsApiKeySession(
        makeSession({
          principalKind: 'api_key_user',
          principalSource: 'api_key_helper',
          headersKind: 'bearer',
          providerPlan: {
            mode: 'noumena_managed',
            source: 'api_key_helper',
            staticKeyEnvVarName: null,
          },
          scopes: [],
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
