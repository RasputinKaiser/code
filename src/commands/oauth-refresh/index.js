import { isInternalBuild } from '../../capabilities/index.js'

const oauthRefresh = {
  type: 'local',
  name: 'oauth-refresh',
  description: 'Force-refresh Noumena OAuth credentials',
  argumentHint: '[status|run]',
  isEnabled: () => isInternalBuild(),
  isHidden: true,
  immediate: true,
  supportsNonInteractive: true,
  load: () => import('./oauth-refresh.js'),
}

export default oauthRefresh
