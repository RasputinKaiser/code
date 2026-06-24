import { isPolicyAllowed } from '../../services/policyLimits/index.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { isEssentialTrafficOnly } from '../../utils/privacyLevel.js'

const issue = {
  aliases: ['bug'],
  type: 'local-jsx',
  name: 'issue',
  description: 'Submit feedback about NCode model behavior',
  argumentHint: '[report]',
  isHidden: true,
  immediate: true,
  isEnabled: () =>
    (process.env.NCODE_BUILD_MODE === 'noumena' || process.env.USER_TYPE === 'ant') &&
    !(
      isEnvTruthy(process.env.DISABLE_FEEDBACK_COMMAND) ||
      isEnvTruthy(process.env.DISABLE_BUG_COMMAND) ||
      isEssentialTrafficOnly() ||
      !isPolicyAllowed('allow_product_feedback')
    ),
  load: () => import('./issue.js'),
}

export default issue
