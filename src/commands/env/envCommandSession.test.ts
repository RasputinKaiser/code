import { describe, expect, it } from 'bun:test'

import type { ResolvedAuthSession } from '../../auth/runtime/types.js'
import {
  hasRemoteEnvCommandSession,
  isCostCommandAuthHiddenForContext,
} from './envCommandSession.js'

function buildSession(
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
      accountUuid: 'acct',
      organizationUuid: 'org',
      organizationName: 'org',
    },
    subscription: {
      subscriptionName: 'Max',
      subscriptionType: 'max',
      rateLimitTier: 'default',
    },
    scopes: ['user:inference', 'user:profile'],
    hasUsableToken: true,
    hasUsableApiKey: false,
    accessToken: 'token',
    accessTokenExpiresAt: null,
    refreshTokenPresent: true,
    apiKey: null,
    rawAuthTokenSource: 'managed-session',
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

describe('envCommandSession', () => {
  it('accepts managed remote-env sessions', () => {
    expect(hasRemoteEnvCommandSession(buildSession())).toBe(true)
  })

  it('rejects api-key remote-env sessions', () => {
    expect(
      hasRemoteEnvCommandSession(
        buildSession({
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
          refreshTokenPresent: false,
          apiKey: 'key',
          rawAuthTokenSource: null,
          rawApiKeySource: 'ANTHROPIC_API_KEY',
        }),
      ),
    ).toBe(false)
  })

  it('hides cost for oauth-backed external sessions but not internal builds', () => {
    const session = buildSession()

    expect(
      isCostCommandAuthHiddenForContext({
        isInternalBuild: false,
        session,
      }),
    ).toBe(true)

    expect(
      isCostCommandAuthHiddenForContext({
        isInternalBuild: true,
        session,
      }),
    ).toBe(false)
  })

  it('does not hide cost for api-key sessions', () => {
    const session = buildSession({
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
      refreshTokenPresent: false,
      apiKey: 'key',
      rawAuthTokenSource: null,
      rawApiKeySource: 'ANTHROPIC_API_KEY',
    })

    expect(
      isCostCommandAuthHiddenForContext({
        isInternalBuild: false,
        session,
      }),
    ).toBe(false)
  })
})
