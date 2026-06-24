import { getAuthRuntime } from '../../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'
import { buildRateLimitUiSessionState } from '../../services/rateLimitUiSession.js'

type UsageSessionInput =
  | Pick<
      ResolvedAuthSession,
      'headersKind' | 'providerPlan' | 'scopes' | 'subscription'
    >
  | null
  | undefined

export interface UsageSessionState {
  subscriptionType: string | null
  showSonnetBar: boolean
  isProOrMax: boolean
}

export function buildUsageSessionState(
  session: UsageSessionInput,
): UsageSessionState {
  const rateLimitSession = buildRateLimitUiSessionState(session)
  const subscriptionType = rateLimitSession.subscriptionType

  return {
    subscriptionType,
    showSonnetBar:
      subscriptionType === 'max' ||
      subscriptionType === 'team' ||
      subscriptionType === null,
    isProOrMax:
      subscriptionType === 'pro' || subscriptionType === 'max',
  }
}

export function getCurrentUsageSessionState(): UsageSessionState {
  return buildUsageSessionState(getAuthRuntime().getCurrentSession())
}
