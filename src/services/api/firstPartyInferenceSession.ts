import { getAuthRuntime } from 'src/auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from 'src/auth/runtime/types.js'

export function isOauthBackedFirstPartyInferenceSession(
  session: Pick<ResolvedAuthSession, 'providerPlan' | 'headersKind' | 'scopes'>,
): boolean {
  return (
    session.providerPlan.mode === 'noumena_managed' &&
    session.headersKind === 'bearer' &&
    session.scopes.includes('user:inference')
  )
}

export function getCurrentOauthBackedFirstPartyInferenceSession():
  | ResolvedAuthSession
  | null {
  const session = getAuthRuntime().getCurrentSession()
  return isOauthBackedFirstPartyInferenceSession(session) ? session : null
}

export function getCurrentOauthBackedInferenceAccountUuid(): string {
  return getCurrentOauthBackedFirstPartyInferenceSession()?.identity
    .accountUuid ?? ''
}
