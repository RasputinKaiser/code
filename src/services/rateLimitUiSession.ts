import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'
import { isOauthBackedFirstPartyInferenceSession } from './api/firstPartyInferenceSession.js'

type RateLimitUiSessionInput =
  | Pick<
      ResolvedAuthSession,
      'subscription' | 'providerPlan' | 'headersKind' | 'scopes'
    >
  | null
  | undefined

export interface RateLimitUiSessionState {
  subscriptionType: string | null
  rateLimitTier: string | null
  isOauthBackedFirstPartySession: boolean
  isTeamOrEnterprise: boolean
}

export function buildRateLimitUiSessionState(
  session: RateLimitUiSessionInput,
): RateLimitUiSessionState {
  const isOauthBackedFirstPartySession =
    session != null && isOauthBackedFirstPartyInferenceSession(session)
  const subscriptionType = isOauthBackedFirstPartySession
    ? session.subscription.subscriptionType
    : null
  const rateLimitTier = isOauthBackedFirstPartySession
    ? session.subscription.rateLimitTier
    : null

  return {
    subscriptionType,
    rateLimitTier,
    isOauthBackedFirstPartySession,
    isTeamOrEnterprise:
      subscriptionType === 'team' || subscriptionType === 'enterprise',
  }
}

export function getCurrentRateLimitUiSessionState(): RateLimitUiSessionState {
  return buildRateLimitUiSessionState(getAuthRuntime().getCurrentSession())
}
