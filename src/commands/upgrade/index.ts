import type { Command } from '../../commands.js'
import {
  type CommandAvailabilitySession,
  getCurrentCommandAvailabilitySession,
} from '../../utils/commandAvailability.js'
import { isEnvTruthy } from '../../utils/envUtils.js'

export function isUpgradeCommandEnabledForContext(params: {
  isDisabledByEnv: boolean
  session: CommandAvailabilitySession
}): boolean {
  if (params.isDisabledByEnv) {
    return false
  }

  return params.session?.subscription.subscriptionType !== 'enterprise'
}

const upgrade = {
  type: 'local-jsx',
  name: 'upgrade',
  description: 'Upgrade to Max for higher rate limits and more Opus',
  availability: ['claude-ai'],
  isEnabled: () =>
    isUpgradeCommandEnabledForContext({
      isDisabledByEnv: isEnvTruthy(process.env.DISABLE_UPGRADE_COMMAND),
      session: getCurrentCommandAvailabilitySession(),
    }),
  load: () => import('./upgrade.js'),
} satisfies Command

export default upgrade
