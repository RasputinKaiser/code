import { formatTotalCost } from '../../cost-tracker.js'
import { isInternalBuild } from 'src/capabilities/static.js'
import { currentLimits } from '../../services/claudeAiLimits.js'
import type { LocalCommandCall } from '../../types/command.js'
import {
  type CommandAvailabilitySession,
  getCurrentCommandAvailabilitySession,
  hasOauthCommandAvailabilitySession,
} from '../../utils/commandAvailability.js'

export function buildCostCommandText(params: {
  session: CommandAvailabilitySession
  totalCost: string
  isUsingOverage: boolean
  isInternalBuild: boolean
}): string {
  const { session, totalCost, isUsingOverage, isInternalBuild } = params

  if (!hasOauthCommandAvailabilitySession(session)) {
    return totalCost
  }

  let value: string

  if (isUsingOverage) {
    value =
      'You are currently using your overages to power your Code usage. We will automatically switch you back to your subscription rate limits when they reset'
  } else {
    value =
      'You are currently using your subscription to power your Code usage'
  }

  if (isInternalBuild) {
    value += `\n\n[NOUMENA-ONLY] Showing cost anyway:\n ${totalCost}`
  }

  return value
}

export const call: LocalCommandCall = async () => {
  const totalCost = formatTotalCost()

  return {
    type: 'text',
    value: buildCostCommandText({
      session: getCurrentCommandAvailabilitySession(),
      totalCost,
      isUsingOverage: currentLimits.isUsingOverage,
      isInternalBuild: isInternalBuild(),
    }),
  }
}
