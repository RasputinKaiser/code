import { hasOauthCommandAvailabilitySession } from '../utils/commandAvailability.js'
import type { CommandAvailabilitySession } from '../utils/commandAvailability.js'

export function shouldRequireChromeManagedAccountNotice(params: {
  buildMode: string | undefined
  userType: string | undefined
  session: CommandAvailabilitySession
}): boolean {
  const isInternalUser =
    params.buildMode === 'noumena' || params.userType === 'ant'
  if (isInternalUser) {
    return false
  }
  return !hasOauthCommandAvailabilitySession(params.session)
}
