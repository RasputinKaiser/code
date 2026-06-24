import * as React from 'react'
import { getOauthProfileFromApiKey } from 'src/services/oauth/getOauthProfile.js'
import {
  getCurrentCommandAvailabilitySession,
  hasOauthCommandAvailabilitySession,
} from 'src/utils/commandAvailability.js'
import type { CommandAvailabilitySession } from 'src/utils/commandAvailability.js'
import { Text } from '../../ink.js'
import { logEvent } from '../../services/analytics/index.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { useStartupNotification } from './useStartupNotification.js'

const MAX_SHOW_COUNT = 3

/**
 * Hook to check if the user has a subscription on Console but isn't logged into it.
 */
export function useCanSwitchToExistingSubscription(): void {
  useStartupNotification(async () => {
    if ((getGlobalConfig().subscriptionNoticeCount ?? 0) >= MAX_SHOW_COUNT) {
      return null
    }

    const subscriptionType =
      await getExistingManagedSubscriptionFromApiKey()
    if (subscriptionType === null) {
      return null
    }

    saveGlobalConfig(current => ({
      ...current,
      subscriptionNoticeCount: (current.subscriptionNoticeCount ?? 0) + 1,
    }))
    logEvent('ncode_switch_to_subscription_notice_shown', {})

    return {
      key: 'switch-to-subscription',
      jsx: (
        <Text color="suggestion">
          Use your existing {subscriptionType} subscription with Code
          <Text color="text" dimColor>
            {' '}
            · /login to activate
          </Text>
        </Text>
      ),
      priority: 'low' as const,
    }
  })
}

/**
 * Checks if the user has a subscription but is not currently logged into it.
 * This helps inform users they should run /login to access their subscription.
 */
export async function getExistingManagedSubscriptionFromApiKey(
  session: CommandAvailabilitySession = getCurrentCommandAvailabilitySession(),
): Promise<'Max' | 'Pro' | null> {
  // If already using managed first-party auth, there is nothing to switch to.
  if (!shouldCheckForExistingSubscriptionNotice(session)) {
    return null
  }

  const profile = await getOauthProfileFromApiKey()
  if (!profile) {
    return null
  }
  if (profile.account.has_claude_max) {
    return 'Max'
  }
  if (profile.account.has_claude_pro) {
    return 'Pro'
  }
  return null
}

export function shouldCheckForExistingSubscriptionNotice(
  session: CommandAvailabilitySession,
): boolean {
  return !hasOauthCommandAvailabilitySession(session)
}
