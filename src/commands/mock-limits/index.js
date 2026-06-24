import { isInternalBuild } from '../../capabilities/index.js'

const mockLimits = {
  type: 'local',
  name: 'mock-limits',
  description: 'Configure ANT-only mock rate limit scenarios and headers',
  argumentHint:
    '[status|scenarios|scenario <name>|header <key> <value>|subscription <type>|billing <mode>|clear]',
  isEnabled: () => isInternalBuild(),
  isHidden: true,
  immediate: true,
  supportsNonInteractive: true,
  load: () => import('./mock-limits.js'),
}

export default mockLimits
