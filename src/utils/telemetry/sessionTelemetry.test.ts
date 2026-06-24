import { describe, expect, it } from 'bun:test'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'
import { buildTelemetrySessionState } from './sessionTelemetry.js'

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

describe('telemetry session canonical runtime helpers', () => {
  it('treats managed oauth-backed first-party sessions as telemetry oauth sessions', () => {
    expect(buildTelemetrySessionState(makeSession())).toEqual({
      isOauthBackedFirstPartySession: true,
      subscriptionType: 'team',
      isEnterpriseOrTeam: true,
    })
  })

  it('treats service oauth bearer sessions as telemetry oauth sessions', () => {
    expect(
      buildTelemetrySessionState(
        makeSession({
          principalKind: 'service_principal',
          principalSource: 'service_oauth_env',
          subscription: {
            subscriptionName: 'Noumena Enterprise',
            subscriptionType: 'enterprise',
            rateLimitTier: 'tier-1',
          },
          rawAuthTokenSource: 'NCODE_OAUTH_TOKEN',
        }),
      ),
    ).toEqual({
      isOauthBackedFirstPartySession: true,
      subscriptionType: 'enterprise',
      isEnterpriseOrTeam: true,
    })
  })

  it('does not treat direct api-key sessions as telemetry oauth sessions', () => {
    expect(
      buildTelemetrySessionState(
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
    ).toEqual({
      isOauthBackedFirstPartySession: false,
      subscriptionType: null,
      isEnterpriseOrTeam: false,
    })
  })

  it('does not treat static BYOK env-key sessions as telemetry oauth sessions', () => {
    expect(
      buildTelemetrySessionState(
        makeSession({
          principalKind: 'api_key_user',
          principalSource: 'direct_api_key_env',
          headersKind: 'api_key',
          providerAuthKind: 'none',
          providerPlan: {
            mode: 'byok_static_env',
            source: 'byok_static_env',
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
    ).toEqual({
      isOauthBackedFirstPartySession: false,
      subscriptionType: null,
      isEnterpriseOrTeam: false,
    })
  })
})
