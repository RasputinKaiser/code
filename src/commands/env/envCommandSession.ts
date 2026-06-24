import {
  hasManagedRemoteCommandPrincipal,
} from '../../auth/capabilities/remote.js'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'
import {
  hasOauthCommandAvailabilitySession,
  type CommandAvailabilitySession,
} from '../../utils/commandAvailability.js'

export function hasRemoteEnvCommandSession(
  session: ResolvedAuthSession | null | undefined,
): boolean {
  return Boolean(session && hasManagedRemoteCommandPrincipal(session))
}

export function isCostCommandAuthHiddenForContext(params: {
  isInternalBuild: boolean
  session: CommandAvailabilitySession
}): boolean {
  if (params.isInternalBuild) {
    return false
  }

  return hasOauthCommandAvailabilitySession(params.session)
}
