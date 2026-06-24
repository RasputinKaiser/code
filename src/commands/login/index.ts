import type { Command } from '../../commands.js'
import {
  getCurrentCommandAvailabilitySession,
  shouldDescribeLoginAsAccountSwitch,
} from '../../utils/commandAvailability.js'
import { isEnvTruthy } from '../../utils/envUtils.js'

export default () =>
  ({
    type: 'local-jsx',
    name: 'login',
    description: shouldDescribeLoginAsAccountSwitch(
      getCurrentCommandAvailabilitySession(),
    )
      ? 'Switch Noumena accounts'
      : 'Sign in with your Noumena account',
    isEnabled: () => !isEnvTruthy(process.env.DISABLE_LOGIN_COMMAND),
    load: () => import('./login.js'),
  }) satisfies Command
