import { afterEach, describe, expect, it } from 'bun:test'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'
import { buildTelemetryIdentityAttributes } from './telemetryAttributes.js'

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
      accountUuid: '11111111-1111-1111-1111-111111111111',
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

describe('telemetryAttributes canonical runtime helpers', () => {
  afterEach(() => {
    delete process.env.OTEL_METRICS_INCLUDE_ACCOUNT_UUID
  })

  it('defaults to privacy-preserving identity attributes for oauth-backed first-party sessions in public builds', () => {
    expect(buildTelemetryIdentityAttributes(makeSession())).toMatchObject({
      'organization.id': 'org-123',
      'user.email': 'user@example.com',
    })
    expect(buildTelemetryIdentityAttributes(makeSession())).not.toHaveProperty('user.account_uuid')
  })

  it('can explicitly opt in to account-level telemetry cardinality', () => {
    process.env.OTEL_METRICS_INCLUDE_ACCOUNT_UUID = '1'
    expect(buildTelemetryIdentityAttributes(makeSession())).toMatchObject({
      'organization.id': 'org-123',
      'user.email': 'user@example.com',
      'user.account_uuid': '11111111-1111-1111-1111-111111111111',
    })
  })

  it('includes identity attributes for service bearer sessions when identity is available', () => {
    const attributes = buildTelemetryIdentityAttributes(
      makeSession({
        principalKind: 'service_principal',
        principalSource: 'service_oauth_env',
        rawAuthTokenSource: 'NCODE_OAUTH_TOKEN',
      }),
    )
    expect(attributes).toMatchObject({
      'organization.id': 'org-123',
      'user.email': 'user@example.com',
    })
    expect(attributes).not.toHaveProperty('user.account_uuid')
  })

  it('does not include identity attributes for direct api-key or static BYOK sessions', () => {
    expect(
      buildTelemetryIdentityAttributes(
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
    ).toEqual({})

    expect(
      buildTelemetryIdentityAttributes(
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
    ).toEqual({})
  })
})
