import type { ResolvedAuthSession } from './types.js'
import {
  needsLeaseRenewal,
  type ContinuityStatusView,
  type IssuedRuntimeLease,
  type ResolveLeaseOptions,
} from './leases.js'

function buildContinuityState(
  session: ResolvedAuthSession,
  lease: IssuedRuntimeLease | null,
  options: ResolveLeaseOptions = {},
): ContinuityStatusView['continuityState'] {
  if (!lease) {
    return session.principalKind === 'none' ? 'unavailable' : 'degraded'
  }

  switch (lease.state) {
    case 'usable':
      return needsLeaseRenewal(lease, options.nowMs) ? 'renewing' : 'healthy'
    case 'renewing':
    case 'grace_period':
      return 'renewing'
    case 'reauth_required':
      return 'reauth_required'
    case 'degraded':
    case 'revoked':
    case 'expired':
      return 'degraded'
  }
}

function buildLeaseRenewalState(
  lease: IssuedRuntimeLease | null,
  options: ResolveLeaseOptions = {},
): ContinuityStatusView['leaseRenewalState'] {
  if (!lease || !lease.renewable) {
    return 'not_applicable'
  }

  switch (lease.state) {
    case 'grace_period':
      return 'grace_period'
    case 'reauth_required':
      return 'reauth_required'
    case 'degraded':
    case 'revoked':
    case 'expired':
      return 'degraded'
    case 'renewing':
      return 'renewal_due'
    case 'usable':
      return needsLeaseRenewal(lease, options.nowMs) ? 'renewal_due' : 'healthy'
  }
}

export function buildContinuityStatusView(
  session: ResolvedAuthSession,
  lease: IssuedRuntimeLease | null,
  options: ResolveLeaseOptions = {},
): ContinuityStatusView {
  return {
    principalKind: session.principalKind,
    principalSource: session.principalSource,
    sessionState: session.sessionState,
    leaseKind: lease?.leaseKind ?? null,
    leaseState: lease?.state ?? null,
    executionTarget: lease?.executionTarget ?? null,
    providerMode: lease?.providerMode ?? null,
    continuityState: buildContinuityState(session, lease, options),
    leaseRenewalState: buildLeaseRenewalState(lease, options),
    renewable: lease?.renewable ?? false,
    recoveryAction: session.recoveryAction,
    recoveryMessage: lease?.recoveryMessage ?? session.recoveryMessage,
  }
}
