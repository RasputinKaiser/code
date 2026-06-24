import { describe, expect, it } from 'bun:test'
import { buildContinuityStatusView } from './continuity.js'
import type { IssuedRuntimeLease } from './leases.js'
import type { ResolvedAuthSession } from './types.js'

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
      email: 'dev@noumena.com',
      accountUuid: 'acct-1',
      organizationUuid: 'org-1',
      organizationName: 'Acme',
    },
    subscription: {
      subscriptionName: 'Noumena Pro',
      subscriptionType: 'pro',
      rateLimitTier: 'tier-1',
    },
    scopes: ['user:profile', 'user:inference'],
    hasUsableToken: true,
    hasUsableApiKey: false,
    accessToken: 'token',
    accessTokenExpiresAt: Date.now() + 60 * 60 * 1000,
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

function makeLease(
  overrides: Partial<IssuedRuntimeLease> = {},
): IssuedRuntimeLease {
  const nowMs = Date.now()
  return {
    leaseKind: 'local_first_party',
    leaseId: 'local:managed_oauth:org-1:acct-1',
    sessionId: null,
    state: 'usable',
    renewable: true,
    renewalOwner: 'local_runtime',
    issuedAt: nowMs,
    expiresAt: nowMs + 60 * 60 * 1000,
    renewAfter: nowMs + 30 * 60 * 1000,
    graceUntil: nowMs + 65 * 60 * 1000,
    organizationUuid: 'org-1',
    capabilities: ['first_party_api', 'inference'],
    executionTarget: 'local',
    providerMode: 'noumena_managed',
    degradationMode: 'none',
    recoveryMessage: null,
    metadata: {},
    ...overrides,
  }
}

describe('buildContinuityStatusView', () => {
  it('reports healthy continuity for a usable lease that is not due for renewal', () => {
    const nowMs = Date.now()
    const session = makeSession()
    const lease = makeLease({
      issuedAt: nowMs,
      renewAfter: nowMs + 60_000,
    })

    const view = buildContinuityStatusView(session, lease, { nowMs })

    expect(view).toMatchObject({
      continuityState: 'healthy',
      leaseRenewalState: 'healthy',
      leaseKind: 'local_first_party',
      leaseState: 'usable',
      executionTarget: 'local',
      providerMode: 'noumena_managed',
      renewable: true,
    })
  })

  it('reports renewing continuity when the lease is usable but due for renewal', () => {
    const nowMs = Date.now()
    const session = makeSession()
    const lease = makeLease({
      issuedAt: nowMs - 10_000,
      renewAfter: nowMs - 1,
    })

    const view = buildContinuityStatusView(session, lease, { nowMs })

    expect(view).toMatchObject({
      continuityState: 'renewing',
      leaseRenewalState: 'renewal_due',
    })
  })

  it('reports degraded continuity when a principal session exists but no runtime lease is available', () => {
    const view = buildContinuityStatusView(makeSession(), null)

    expect(view).toMatchObject({
      continuityState: 'degraded',
      leaseRenewalState: 'not_applicable',
      leaseKind: null,
      leaseState: null,
      executionTarget: null,
      providerMode: null,
      renewable: false,
    })
  })

  it('reports unavailable continuity when no principal session exists', () => {
    const session = makeSession({
      principalKind: 'none',
      principalSource: 'none',
      sessionState: 'unauthenticated',
      providerAuthKind: 'none',
      providerPlan: {
        mode: 'none',
        source: 'none',
        staticKeyEnvVarName: null,
      },
      headersKind: 'none',
      hasUsableToken: false,
      accessToken: null,
      accessTokenExpiresAt: null,
      refreshTokenPresent: false,
      rawAuthTokenSource: null,
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
      recoveryAction: 'run_auth_login',
      recoveryMessage: 'Not logged in. Run auth login to authenticate.',
    })

    const view = buildContinuityStatusView(session, null)

    expect(view).toMatchObject({
      continuityState: 'unavailable',
      leaseRenewalState: 'not_applicable',
      recoveryAction: 'run_auth_login',
    })
  })

  it('reports reauth-required continuity from the lease state', () => {
    const session = makeSession({
      sessionState: 'expired',
      recoveryAction: 'run_auth_login_managed',
      recoveryMessage: 'Managed OAuth expired. Run auth login --managed to re-authenticate.',
    })
    const lease = makeLease({
      state: 'reauth_required',
      recoveryMessage: 'Runtime lease requires re-authentication before work can continue.',
    })

    const view = buildContinuityStatusView(session, lease)

    expect(view).toMatchObject({
      continuityState: 'reauth_required',
      leaseRenewalState: 'reauth_required',
      recoveryAction: 'run_auth_login_managed',
      recoveryMessage: 'Runtime lease requires re-authentication before work can continue.',
    })
  })
})
