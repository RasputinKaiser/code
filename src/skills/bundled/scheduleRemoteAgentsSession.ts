import { hasUsableManagedRemotePrincipal } from '../../auth/capabilities/remote.js'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'

export function hasScheduleRemoteSkillSession(
  session: ResolvedAuthSession,
): boolean {
  return hasUsableManagedRemotePrincipal(session)
}
