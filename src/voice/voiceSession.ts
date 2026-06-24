import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'

export type VoiceSession =
  | Pick<
      ResolvedAuthSession,
      'providerPlan' | 'headersKind' | 'scopes' | 'accessToken'
    >
  | null
  | undefined

export function hasUsableVoiceSession(session: VoiceSession): boolean {
  return Boolean(
    session &&
      session.providerPlan.mode === 'noumena_managed' &&
      session.headersKind === 'bearer' &&
      session.scopes.includes('user:inference') &&
      session.accessToken,
  )
}

export function getCurrentVoiceSession(): ResolvedAuthSession | null {
  const session = getAuthRuntime().getCurrentSession()
  return hasUsableVoiceSession(session) ? session : null
}
