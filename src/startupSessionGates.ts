import type { ResolvedAuthSession } from './auth/runtime/types.js'
import { buildChannelNotificationAuthState } from './services/mcp/channelNotification.js'

export type StartupSession =
  | Pick<
      ResolvedAuthSession,
      | 'principalSource'
      | 'sessionState'
      | 'accessToken'
      | 'providerPlan'
      | 'headersKind'
      | 'scopes'
      | 'subscription'
    >
  | null
  | undefined

export function shouldSkipDevChannelsDialog(params: {
  channelsEnabled: boolean
  session: StartupSession
}): boolean {
  if (!params.channelsEnabled) {
    return true
  }

  const channelAuth = buildChannelNotificationAuthState(params.session)
  return !channelAuth.hasOauthChannelSession
}

export function hasChromeStartupEligibilitySession(params: {
  buildMode: string | undefined
  userType: string | undefined
  session: StartupSession
}): boolean {
  if (params.buildMode === 'noumena' || params.userType === 'ant') {
    return true
  }

  return Boolean(
    params.session?.providerPlan.mode === 'noumena_managed' &&
      params.session.headersKind === 'bearer' &&
      params.session.scopes.includes('user:inference'),
  )
}

export function hasUsableBridgeStartupSession(
  session: StartupSession,
): boolean {
  return Boolean(
    session?.principalSource === 'managed_oauth' &&
      session.sessionState === 'usable' &&
      session.accessToken,
  )
}
