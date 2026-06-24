import { hasCurrentManagedRemoteCommandPrincipal } from '../../auth/capabilities/remote.js'
import { isPolicyAllowed } from '../../services/policyLimits/index.js'

export default {
  type: 'local-jsx',
  name: 'teleport',
  description: 'Resume a remote session in this terminal',
  argumentHint: '[session id]',
  availability: ['claude-ai'],
  isHidden: true,
  isEnabled: () =>
    hasCurrentManagedRemoteCommandPrincipal() &&
    isPolicyAllowed('allow_remote_sessions'),
  load: () => import('./teleport.js'),
}
