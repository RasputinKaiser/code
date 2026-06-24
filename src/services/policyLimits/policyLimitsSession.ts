import { getAuthRuntime } from '../../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'
import { isOauthBackedFirstPartyInferenceSession } from '../api/firstPartyInferenceSession.js'

export type PolicyLimitsSession =
  | Pick<ResolvedAuthSession, 'providerPlan' | 'headersKind' | 'scopes' | 'subscription' | 'accessToken'>
  | null
  | undefined
export type PolicyLimitsApiKeySession =
  | Pick<ResolvedAuthSession, 'apiKey' | 'rawApiKeySource'>
  | null
  | undefined

export function hasUsablePolicyLimitsBearerSession(
  session: PolicyLimitsSession,
): boolean {
  return Boolean(
    session &&
      isOauthBackedFirstPartyInferenceSession(session) &&
      session.accessToken,
  )
}

export function isEligiblePolicyLimitsOauthSession(
  session: PolicyLimitsSession,
): boolean {
  return Boolean(
    hasUsablePolicyLimitsBearerSession(session) &&
      (session.subscription.subscriptionType === 'team' ||
        session.subscription.subscriptionType === 'enterprise'),
  )
}

export function hasUsablePolicyLimitsApiKeySession(
  session: PolicyLimitsApiKeySession,
): boolean {
  return Boolean(
    session?.apiKey &&
      session.rawApiKeySource &&
      session.rawApiKeySource !== 'apiKeyHelper',
  )
}

export function getCurrentPolicyLimitsSession(): ResolvedAuthSession {
  return getAuthRuntime().getCurrentSession()
}
