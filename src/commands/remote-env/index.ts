import type { Command } from '../../commands.js'
import { hasCurrentManagedRemoteCommandPrincipal } from '../../auth/capabilities/remote.js'
import { isPolicyAllowed } from '../../services/policyLimits/index.js'

export default {
  type: 'local-jsx',
  name: 'remote-env',
  description: 'Configure the default remote environment for teleport sessions',
  isEnabled: () =>
    hasCurrentManagedRemoteCommandPrincipal() &&
    isPolicyAllowed('allow_remote_sessions'),
  get isHidden() {
    return (
      !hasCurrentManagedRemoteCommandPrincipal() ||
      !isPolicyAllowed('allow_remote_sessions')
    )
  },
  load: () => import('./remote-env.js'),
} satisfies Command
