import type { CommandAvailabilitySession } from '../../utils/commandAvailability.js'
import { hasOauthCommandAvailabilitySession } from '../../utils/commandAvailability.js'

export function hasChromeCommandAccessForSession(
  session: CommandAvailabilitySession,
): boolean {
  return hasOauthCommandAvailabilitySession(session)
}
