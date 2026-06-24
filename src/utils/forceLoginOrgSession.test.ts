import { describe, expect, it } from 'bun:test'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'
import {
  getForceLoginOrgMismatchMessage,
  getForceLoginOrgProfileFetchFailureMessage,
  hasForceLoginOrgValidatableSession,
} from './forceLoginOrgSession.js'

function buildSession(
  overrides: Partial<ResolvedAuthSession>,
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

describe('forceLoginOrgSession', () => {
  it('only validates managed and service oauth bearer sessions', () => {
    expect(
      hasForceLoginOrgValidatableSession(
        buildSession({
          principalSource: 'managed_oauth',
          accessToken: 'managed-token',
        }),
      ),
    ).toBe(true)
    expect(
      hasForceLoginOrgValidatableSession(
        buildSession({
          principalSource: 'service_oauth_env',
          accessToken: 'env-token',
        }),
      ),
    ).toBe(true)
    expect(
      hasForceLoginOrgValidatableSession(
        buildSession({
          principalSource: 'service_oauth_fd',
          accessToken: 'fd-token',
        }),
      ),
    ).toBe(true)
    expect(
      hasForceLoginOrgValidatableSession(
        buildSession({
          principalSource: 'direct_api_key_env',
          apiKey: 'api-key',
        }),
      ),
    ).toBe(false)
    expect(
      hasForceLoginOrgValidatableSession(
        buildSession({
          principalSource: 'external_bearer_compat',
          accessToken: 'external-token',
        }),
      ),
    ).toBe(false)
  })

  it('preserves the env-token mismatch message contract', () => {
    expect(
      getForceLoginOrgMismatchMessage({
        requiredOrgUuid: 'org-required',
        tokenOrgUuid: 'org-token',
        rawAuthTokenSource: 'CLAUDE_CODE_OAUTH_TOKEN',
      }),
    ).toContain(
      'The CLAUDE_CODE_OAUTH_TOKEN environment variable provides a token',
    )
  })

  it('preserves the managed-session mismatch login guidance', () => {
    expect(
      getForceLoginOrgMismatchMessage({
        requiredOrgUuid: 'org-required',
        tokenOrgUuid: 'org-token',
        rawAuthTokenSource: 'noumena.com',
      }),
    ).toContain('Please log in with the correct organization: code auth login')
  })

  it('preserves the profile-fetch failure guidance', () => {
    expect(getForceLoginOrgProfileFetchFailureMessage('org-required')).toContain(
      'Unable to verify organization for the current authentication token.',
    )
  })
})
