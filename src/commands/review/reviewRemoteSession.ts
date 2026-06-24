import { getAuthRuntime } from '../../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'
import { buildSubscriptionSessionState } from '../../utils/subscriptionSession.js'

type ReviewRemoteSessionInput =
  | Pick<
      ResolvedAuthSession,
      'providerPlan' | 'headersKind' | 'scopes' | 'subscription'
    >
  | null
  | undefined

export function hasIncludedUltrareview(
  session: ReviewRemoteSessionInput,
): boolean {
  const subscriptionSession = buildSubscriptionSessionState(session)
  return (
    subscriptionSession.isTeamSubscriber ||
    subscriptionSession.isEnterpriseSubscriber
  )
}

export function currentHasIncludedUltrareview(): boolean {
  return hasIncludedUltrareview(getAuthRuntime().getCurrentSession())
}
