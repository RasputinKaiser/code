import { getAuthRuntime } from '../../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'
import { isOauthBackedFirstPartyInferenceSession } from '../api/firstPartyInferenceSession.js'

export type RemoteManagedSettingsSession =
  | Pick<
      ResolvedAuthSession,
      'providerPlan' | 'headersKind' | 'scopes' | 'subscription' | 'accessToken'
    >
  | null
  | undefined
export type RemoteManagedSettingsApiKeySession =
  | Pick<ResolvedAuthSession, 'apiKey' | 'rawApiKeySource'>
  | null
  | undefined

export function hasUsableRemoteManagedSettingsBearerSession(
  session: RemoteManagedSettingsSession,
): boolean {
  return Boolean(
    session &&
      isOauthBackedFirstPartyInferenceSession(session) &&
      session.accessToken,
  )
}

export function isEligibleRemoteManagedSettingsOauthSession(
  session: RemoteManagedSettingsSession,
): boolean {
  return Boolean(
    hasUsableRemoteManagedSettingsBearerSession(session) &&
      (session.subscription.subscriptionType === null ||
        session.subscription.subscriptionType === 'team' ||
        session.subscription.subscriptionType === 'enterprise'),
  )
}

export function hasUsableRemoteManagedSettingsApiKeySession(
  session: RemoteManagedSettingsApiKeySession,
): boolean {
  return Boolean(
    session?.apiKey &&
      session.rawApiKeySource &&
      session.rawApiKeySource !== 'apiKeyHelper',
  )
}

export function getCurrentRemoteManagedSettingsSession(): ResolvedAuthSession {
  return getAuthRuntime().getCurrentSession()
}
