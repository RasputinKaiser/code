import type { Command } from '../../commands.js'
import { checkStatsigFeatureGate_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'

const thinkback = {
  type: 'local-jsx',
  name: 'think-back',
  description: 'Your 2025 Code Year in Review',
  isEnabled: () =>
    checkStatsigFeatureGate_CACHED_MAY_BE_STALE('ncode_thinkback'),
  load: () => import('./thinkback.js'),
} satisfies Command

export default thinkback
