import type { Command } from '../../commands.js'
import {
  type CommandAvailabilitySession,
  getCurrentCommandAvailabilitySession,
  hasOauthCommandAvailabilitySession,
} from '../../utils/commandAvailability.js'

export function isRateLimitOptionsEnabledForContext(
  session: CommandAvailabilitySession,
): boolean {
  return hasOauthCommandAvailabilitySession(session)
}

const rateLimitOptions = {
  type: 'local-jsx',
  name: 'rate-limit-options',
  description: 'Show options when rate limit is reached',
  isEnabled: () =>
    isRateLimitOptionsEnabledForContext(getCurrentCommandAvailabilitySession()),
  isHidden: true, // Hidden from help - only used internally
  load: () => import('./rate-limit-options.js'),
} satisfies Command

export default rateLimitOptions
