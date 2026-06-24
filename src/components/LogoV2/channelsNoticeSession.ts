import type { ResolvedAuthSession } from '../../auth/runtime/types.js'
import { buildChannelNotificationAuthState } from '../../services/mcp/channelNotification.js'

export type ChannelsNoticeSession =
  | Pick<ResolvedAuthSession, 'providerPlan' | 'headersKind' | 'scopes' | 'subscription'>
  | null
  | undefined

export function buildChannelsNoticeSessionState(
  session: ChannelsNoticeSession,
): {
  noAuth: boolean
  subscriptionType: string | null
  isManagedTeamOrEnterprise: boolean
} {
  const authState = buildChannelNotificationAuthState(session)
  return {
    noAuth: !authState.hasOauthChannelSession,
    subscriptionType: authState.subscriptionType,
    isManagedTeamOrEnterprise: authState.isManagedTeamOrEnterprise,
  }
}
