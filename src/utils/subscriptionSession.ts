import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'

export type SubscriptionSessionInput =
  | Pick<
      ResolvedAuthSession,
      'providerPlan' | 'headersKind' | 'scopes' | 'subscription'
    >
  | null
  | undefined

export interface SubscriptionSessionState {
  subscriptionName: string | null
  subscriptionDisplayName: string | null
  subscriptionType: string | null
  rateLimitTier: string | null
  isOauthBackedFirstPartySession: boolean
  isMaxSubscriber: boolean
  isTeamSubscriber: boolean
  isEnterpriseSubscriber: boolean
  isTeamPremiumSubscriber: boolean
  isProSubscriber: boolean
}

export function buildSubscriptionSessionState(
  session: SubscriptionSessionInput,
): SubscriptionSessionState {
  const isOauthBackedFirstPartySession =
    session?.providerPlan.mode === 'noumena_managed' &&
    session.headersKind === 'bearer' &&
    session.scopes.includes('user:inference')

  const subscriptionName = isOauthBackedFirstPartySession
    ? session.subscription.subscriptionName
    : null
  const subscriptionType = isOauthBackedFirstPartySession
    ? session.subscription.subscriptionType
    : null
  const rateLimitTier = isOauthBackedFirstPartySession
    ? session.subscription.rateLimitTier
    : null

  return {
    subscriptionName,
    subscriptionDisplayName: isOauthBackedFirstPartySession
      ? (subscriptionName ?? 'Noumena Managed')
      : null,
    subscriptionType,
    rateLimitTier,
    isOauthBackedFirstPartySession,
    isMaxSubscriber: subscriptionType === 'max',
    isTeamSubscriber: subscriptionType === 'team',
    isEnterpriseSubscriber: subscriptionType === 'enterprise',
    isTeamPremiumSubscriber:
      subscriptionType === 'team' &&
      rateLimitTier === 'default_claude_max_5x',
    isProSubscriber: subscriptionType === 'pro',
  }
}

export function getCurrentSubscriptionSessionState(): SubscriptionSessionState {
  return buildSubscriptionSessionState(getAuthRuntime().getCurrentSession())
}

export function shouldShowAgentConcurrencyNote(
  session: SubscriptionSessionInput,
): boolean {
  return buildSubscriptionSessionState(session).subscriptionType !== 'pro'
}

export function shouldShowCurrentAgentConcurrencyNote(): boolean {
  return shouldShowAgentConcurrencyNote(getAuthRuntime().getCurrentSession())
}
