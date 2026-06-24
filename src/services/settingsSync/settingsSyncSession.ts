import { getAuthRuntime } from '../../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'

export type SettingsSyncSession =
  | Pick<
      ResolvedAuthSession,
      'providerPlan' | 'headersKind' | 'scopes' | 'accessToken'
    >
  | null
  | undefined

export function hasUsableSettingsSyncSession(
  session: SettingsSyncSession,
): boolean {
  return Boolean(
    session &&
      session.providerPlan.mode === 'noumena_managed' &&
      session.headersKind === 'bearer' &&
      session.scopes.includes('user:inference') &&
      session.accessToken,
  )
}

export function getCurrentSettingsSyncSession(): ResolvedAuthSession | null {
  const session = getAuthRuntime().getCurrentSession()
  return hasUsableSettingsSyncSession(session) ? session : null
}
