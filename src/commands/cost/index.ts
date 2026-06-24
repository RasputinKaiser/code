/**
 * Cost command - minimal metadata only.
 * Implementation is lazy-loaded from cost.ts to reduce startup time.
 */
import type { Command } from '../../commands.js'
import { isInternalBuild } from 'src/capabilities/static.js'
import {
  type CommandAvailabilitySession,
  getCurrentCommandAvailabilitySession,
  hasOauthCommandAvailabilitySession,
} from '../../utils/commandAvailability.js'

export function isCostCommandHiddenForContext(params: {
  isInternalBuild: boolean
  session: CommandAvailabilitySession
}): boolean {
  if (params.isInternalBuild) {
    return false
  }

  return hasOauthCommandAvailabilitySession(params.session)
}

const cost = {
  type: 'local',
  name: 'cost',
  description: 'Show the total cost and duration of the current session',
  get isHidden() {
    return isCostCommandHiddenForContext({
      isInternalBuild: isInternalBuild(),
      session: getCurrentCommandAvailabilitySession(),
    })
  },
  supportsNonInteractive: true,
  load: () => import('./cost.js'),
} satisfies Command

export default cost
