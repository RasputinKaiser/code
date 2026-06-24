import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import { getAuthRuntime } from '../../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'
import type { Command } from '../../commands.js'
import { getGlobalConfig } from '../../utils/config.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { buildSubscriptionSessionState } from '../../utils/subscriptionSession.js'

type ExtraUsageCommandSession = Pick<
  ResolvedAuthSession,
  'headersKind' | 'providerPlan' | 'scopes' | 'subscription'
>

function hasSupportedExtraUsageBillingType(
  billingType: string | null | undefined,
): boolean {
  return (
    billingType === 'stripe_subscription' ||
    billingType === 'stripe_subscription_contracted' ||
    billingType === 'apple_subscription' ||
    billingType === 'google_play_subscription'
  )
}

export function isExtraUsageAllowedForContext(params: {
  isDisabledByEnv: boolean
  session: ExtraUsageCommandSession | null | undefined
  billingType: string | null | undefined
}): boolean {
  if (params.isDisabledByEnv) {
    return false
  }

  if (!buildSubscriptionSessionState(params.session).isOauthBackedFirstPartySession) {
    return false
  }

  return hasSupportedExtraUsageBillingType(params.billingType)
}

function isExtraUsageAllowed(): boolean {
  return isExtraUsageAllowedForContext({
    isDisabledByEnv: isEnvTruthy(process.env.DISABLE_EXTRA_USAGE_COMMAND),
    session: getAuthRuntime().getCurrentSession(),
    billingType: getGlobalConfig().oauthAccount?.billingType,
  })
}

export const extraUsage = {
  type: 'local-jsx',
  name: 'extra-usage',
  description: 'Configure extra usage to keep working when limits are hit',
  isEnabled: () => isExtraUsageAllowed() && !getIsNonInteractiveSession(),
  load: () => import('./extra-usage.js'),
} satisfies Command

export const extraUsageNonInteractive = {
  type: 'local',
  name: 'extra-usage',
  supportsNonInteractive: true,
  description: 'Configure extra usage to keep working when limits are hit',
  isEnabled: () => isExtraUsageAllowed() && getIsNonInteractiveSession(),
  get isHidden() {
    return !getIsNonInteractiveSession()
  },
  load: () => import('./extra-usage-noninteractive.js'),
} satisfies Command
