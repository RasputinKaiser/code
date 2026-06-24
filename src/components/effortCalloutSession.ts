import type { GlobalConfig } from '../utils/config.js'
import { parseUserSpecifiedModel } from '../utils/model/model.js'
import {
  buildSubscriptionSessionState,
  type SubscriptionSessionInput,
} from '../utils/subscriptionSession.js'

export interface EffortCalloutDecision {
  shouldShow: boolean
  shouldMarkV2Dismissed: boolean
}

type EffortCalloutConfigInput = Pick<
  GlobalConfig,
  'effortCalloutV2Dismissed' | 'numStartups' | 'effortCalloutDismissed'
>

export function getEffortCalloutDecision(
  model: string,
  config: EffortCalloutConfigInput,
  session: SubscriptionSessionInput,
  enabled: boolean,
): EffortCalloutDecision {
  const parsed = parseUserSpecifiedModel(model)
  if (!parsed.toLowerCase().includes('opus-4-6')) {
    return {
      shouldShow: false,
      shouldMarkV2Dismissed: false,
    }
  }

  if (config.effortCalloutV2Dismissed) {
    return {
      shouldShow: false,
      shouldMarkV2Dismissed: false,
    }
  }

  if (config.numStartups <= 1) {
    return {
      shouldShow: false,
      shouldMarkV2Dismissed: true,
    }
  }

  const subscriptionSession = buildSubscriptionSessionState(session)
  if (subscriptionSession.isProSubscriber) {
    if (config.effortCalloutDismissed) {
      return {
        shouldShow: false,
        shouldMarkV2Dismissed: true,
      }
    }

    return {
      shouldShow: enabled,
      shouldMarkV2Dismissed: false,
    }
  }

  if (
    subscriptionSession.isMaxSubscriber ||
    subscriptionSession.isTeamSubscriber
  ) {
    return {
      shouldShow: enabled,
      shouldMarkV2Dismissed: false,
    }
  }

  return {
    shouldShow: false,
    shouldMarkV2Dismissed: true,
  }
}
