import { getAuthRuntime } from '../../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'
import { getGlobalConfig } from '../../utils/config.js'

type ManagedRateLimitSession = null | Pick<
  ResolvedAuthSession,
  'principalSource' | 'subscription'
>

export interface RateLimitOptionsSessionState {
  hasExtraUsageEnabled: boolean
  rateLimitTier: string | null
  subscriptionType: string | null
}

export function buildRateLimitOptionsSessionState(
  session: ManagedRateLimitSession,
  hasExtraUsageEnabled: boolean,
): RateLimitOptionsSessionState {
  if (session?.principalSource !== 'managed_oauth') {
    return {
      hasExtraUsageEnabled: false,
      rateLimitTier: null,
      subscriptionType: null,
    }
  }

  return {
    hasExtraUsageEnabled,
    rateLimitTier: session.subscription.rateLimitTier,
    subscriptionType: session.subscription.subscriptionType,
  }
}

export function getCurrentRateLimitOptionsSessionState(): RateLimitOptionsSessionState {
  return buildRateLimitOptionsSessionState(
    getAuthRuntime().getCurrentManagedSession(),
    getGlobalConfig().oauthAccount?.hasExtraUsageEnabled === true,
  )
}
