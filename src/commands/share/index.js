import { isInternalBuild } from '../../capabilities/index.js'
import { isPolicyAllowed } from '../../services/policyLimits/index.js'
import { isEssentialTrafficOnly } from '../../utils/privacyLevel.js'

const share = {
  type: 'local',
  name: 'share',
  description: 'Upload this session transcript and return a shareable ccshare URL',
  argumentHint: '[--help]',
  isHidden: true,
  immediate: true,
  supportsNonInteractive: true,
  isEnabled: () =>
    isInternalBuild() &&
    !isEssentialTrafficOnly() &&
    isPolicyAllowed('allow_product_feedback'),
  load: () => import('./share.js'),
}

export default share
