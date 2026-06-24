import { isEnvTruthy } from '../../utils/envUtils.js'

const onboarding = {
  type: 'local-jsx',
  name: 'onboarding',
  description: 'Re-run Code onboarding and authentication setup',
  isHidden: true,
  immediate: true,
  isEnabled: () =>
    (process.env.NCODE_BUILD_MODE === 'noumena' || process.env.USER_TYPE === 'ant') && !isEnvTruthy(process.env.IS_DEMO),
  load: () => import('./onboarding.js'),
}

export default onboarding
