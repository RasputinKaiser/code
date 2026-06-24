import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'
import { getAPIProvider } from '../utils/model/providers.js'
import { buildSubscriptionSessionState } from '../utils/subscriptionSession.js'

type MigrationSubscriptionSessionInput =
  | Pick<
      ResolvedAuthSession,
      'providerPlan' | 'headersKind' | 'scopes' | 'subscription'
    >
  | null
  | undefined

export function shouldRunSonnet45To46Migration(
  session: MigrationSubscriptionSessionInput,
  apiProvider: string,
): boolean {
  if (apiProvider !== 'firstParty') {
    return false
  }

  const subscription = buildSubscriptionSessionState(session)
  return (
    subscription.isProSubscriber ||
    subscription.isMaxSubscriber ||
    subscription.isTeamPremiumSubscriber
  )
}

export function shouldRunCurrentSonnet45To46Migration(): boolean {
  return shouldRunSonnet45To46Migration(
    getAuthRuntime().getCurrentSession(),
    getAPIProvider(),
  )
}

export function shouldRunResetProToOpusDefaultMigration(
  session: MigrationSubscriptionSessionInput,
  apiProvider: string,
): boolean {
  if (apiProvider !== 'firstParty') {
    return false
  }

  return buildSubscriptionSessionState(session).isProSubscriber
}

export function shouldRunCurrentResetProToOpusDefaultMigration(): boolean {
  return shouldRunResetProToOpusDefaultMigration(
    getAuthRuntime().getCurrentSession(),
    getAPIProvider(),
  )
}
