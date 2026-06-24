import { feature } from 'bun:bundle'
import type { Command } from '../../commands.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { isPolicyAllowed } from '../../services/policyLimits/index.js'

const hasRemoteTriggerFeature = feature('AGENT_TRIGGERS_REMOTE') ? true : false

function isAgentsPlatformEnabled(): boolean {
  return (
    hasRemoteTriggerFeature &&
    getFeatureValue_CACHED_MAY_BE_STALE('ncode_surreal_dali', false) &&
    isPolicyAllowed('allow_remote_sessions')
  )
}

const agentsPlatform = {
  type: 'local-jsx',
  name: 'agents-platform',
  description: 'Manage remote routines',
  isEnabled: isAgentsPlatformEnabled,
  load: () => import('./agents-platform.js'),
} satisfies Command

export default agentsPlatform
