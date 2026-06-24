import { getAuthRuntime } from '../../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'

export type TeamMemorySyncSession =
  | Pick<
      ResolvedAuthSession,
      'providerPlan' | 'headersKind' | 'scopes' | 'accessToken'
    >
  | null
  | undefined

export function hasUsableTeamMemorySyncSession(
  session: TeamMemorySyncSession,
): boolean {
  return Boolean(
    session &&
      session.providerPlan.mode === 'noumena_managed' &&
      session.headersKind === 'bearer' &&
      session.scopes.includes('user:inference') &&
      session.scopes.includes('user:profile') &&
      session.accessToken,
  )
}

export function getCurrentTeamMemorySyncSession():
  | ResolvedAuthSession
  | null {
  const session = getAuthRuntime().getCurrentSession()
  return hasUsableTeamMemorySyncSession(session) ? session : null
}
