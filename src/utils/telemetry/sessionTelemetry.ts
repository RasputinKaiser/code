import { getAuthRuntime } from '../../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'

type TelemetrySessionInput =
  | Pick<
      ResolvedAuthSession,
      'providerPlan' | 'headersKind' | 'scopes' | 'subscription'
    >
  | null
  | undefined

export interface TelemetrySessionState {
  isOauthBackedFirstPartySession: boolean
  subscriptionType: string | null
  isEnterpriseOrTeam: boolean
}

export function buildTelemetrySessionState(
  session: TelemetrySessionInput,
): TelemetrySessionState {
  const isOauthBackedFirstPartySession =
    session != null &&
    session.providerPlan.mode === 'noumena_managed' &&
    session.headersKind === 'bearer' &&
    session.scopes.includes('user:inference')

  const subscriptionType = isOauthBackedFirstPartySession
    ? session.subscription.subscriptionType
    : null

  return {
    isOauthBackedFirstPartySession,
    subscriptionType,
    isEnterpriseOrTeam:
      subscriptionType === 'enterprise' || subscriptionType === 'team',
  }
}

export function getCurrentTelemetrySessionState(): TelemetrySessionState {
  return buildTelemetrySessionState(getAuthRuntime().getCurrentSession())
}
