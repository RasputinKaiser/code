import { getAuthRuntime } from '../../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'
import type { Command } from '../../commands.js'
import { buildSubscriptionSessionState } from '../../utils/subscriptionSession.js'

type PrivacySettingsSession = Pick<
  ResolvedAuthSession,
  'headersKind' | 'providerPlan' | 'scopes' | 'subscription'
>

export function isPrivacySettingsEnabledForSession(
  session: PrivacySettingsSession | null | undefined,
): boolean {
  const subscriptionState = buildSubscriptionSessionState(session)
  return subscriptionState.isProSubscriber || subscriptionState.isMaxSubscriber
}

const privacySettings = {
  type: 'local-jsx',
  name: 'privacy-settings',
  description: 'View and update your privacy settings',
  isEnabled: () => {
    return isPrivacySettingsEnabledForSession(getAuthRuntime().getCurrentSession())
  },
  load: () => import('./privacy-settings.js'),
} satisfies Command

export default privacySettings
