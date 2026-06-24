import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'
import { getGlobalConfig } from './config.js'
import { isEnvTruthy } from './envUtils.js'

export function hasConsoleBillingAccessForSession(
  session: Pick<
    ResolvedAuthSession,
    'principalKind' | 'providerAuthKind' | 'subscription'
  >,
  roles: {
    organizationRole: string | null | undefined
    workspaceRole: string | null | undefined
  },
): boolean {
  if (session.providerAuthKind !== 'noumena_first_party') {
    return false
  }

  if (session.principalKind === 'none' || session.principalKind === 'third_party_provider') {
    return false
  }

  if (session.subscription.subscriptionType !== null) {
    return false
  }

  if (!roles.organizationRole && !roles.workspaceRole) {
    return false
  }

  return (
    ['admin', 'billing'].includes(roles.organizationRole) ||
    ['workspace_admin', 'workspace_billing'].includes(roles.workspaceRole)
  )
}

export function hasManagedPlanBillingAccessForSession(
  session: Pick<ResolvedAuthSession, 'principalSource' | 'sessionState' | 'subscription'>,
  roles: {
    organizationRole: string | null | undefined
  },
): boolean {
  if (
    session.principalSource !== 'managed_oauth' ||
    session.sessionState !== 'usable'
  ) {
    return false
  }

  const subscriptionType = session.subscription.subscriptionType

  if (!subscriptionType) {
    return false
  }

  if (subscriptionType === 'max' || subscriptionType === 'pro') {
    return true
  }

  return (
    !!roles.organizationRole &&
    ['admin', 'billing', 'owner', 'primary_owner'].includes(
      roles.organizationRole,
    )
  )
}

export function hasConsoleBillingAccess(): boolean {
  // Check if cost reporting is disabled via environment variable
  if (isEnvTruthy(process.env.DISABLE_COST_WARNINGS)) {
    return false
  }

  const config = getGlobalConfig()
  return hasConsoleBillingAccessForSession(getAuthRuntime().getCurrentSession(), {
    organizationRole: config.oauthAccount?.organizationRole,
    workspaceRole: config.oauthAccount?.workspaceRole,
  })
}

// Mock billing access for /mock-limits testing (set by mockRateLimits.ts)
let mockBillingAccessOverride: boolean | null = null

export function setMockBillingAccessOverride(value: boolean | null): void {
  mockBillingAccessOverride = value
}

export function hasManagedPlanBillingAccess(): boolean {
  // Check for mock billing access first (for /mock-limits testing)
  if (mockBillingAccessOverride !== null) {
    return mockBillingAccessOverride
  }
  const config = getGlobalConfig()
  return hasManagedPlanBillingAccessForSession(
    getAuthRuntime().getCurrentSession(),
    {
      organizationRole: config.oauthAccount?.organizationRole,
    },
  )
}
