import type { ResolvedAuthSession } from '../../auth/runtime/types.js'

export interface ExtraUsageSessionState {
  subscriptionType: string | null
  isTeamOrEnterprise: boolean
}

export function buildExtraUsageSessionState(
  session: Pick<ResolvedAuthSession, 'subscription'> | null | undefined,
): ExtraUsageSessionState {
  const subscriptionType = session?.subscription.subscriptionType ?? null

  return {
    subscriptionType,
    isTeamOrEnterprise:
      subscriptionType === 'team' || subscriptionType === 'enterprise',
  }
}
