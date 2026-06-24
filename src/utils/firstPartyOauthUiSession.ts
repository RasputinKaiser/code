import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'

export type FirstPartyOauthUiSession =
  | Pick<ResolvedAuthSession, 'principalSource'>
  | null
  | undefined

export function isFirstPartyOauthUiEnabledForSession(
  session: FirstPartyOauthUiSession,
): boolean {
  return (
    session?.principalSource === 'none' ||
    session?.principalSource === 'managed_oauth' ||
    session?.principalSource === 'console_api_key'
  )
}

export function isCurrentFirstPartyOauthUiEnabled(): boolean {
  return isFirstPartyOauthUiEnabledForSession(
    getAuthRuntime().getCurrentSession(),
  )
}
