import { isFirstPartyNoumenaBaseUrl } from './model/providers.js'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'
import type { Command } from '../types/command.js'

export type CommandAvailabilitySession =
  | Pick<
      ResolvedAuthSession,
      'headersKind' | 'principalSource' | 'providerPlan' | 'scopes' | 'subscription'
    >
  | null
  | undefined

export function hasOauthCommandAvailabilitySession(
  session: CommandAvailabilitySession,
): boolean {
  return (
    session?.providerPlan.mode === 'noumena_managed' &&
    session.headersKind === 'bearer' &&
    session.scopes.includes('user:inference')
  )
}

export function getCurrentCommandAvailabilitySession(): CommandAvailabilitySession {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { getAuthRuntime } =
      require('../auth/runtime/AuthRuntime.js') as typeof import('../auth/runtime/AuthRuntime.js')
    /* eslint-enable @typescript-eslint/no-require-imports */
    return getAuthRuntime().getCurrentSession()
  } catch {
    return null
  }
}

export function shouldIncludeFirstPartyAuthCommands(
  session: CommandAvailabilitySession,
): boolean {
  return session?.providerPlan.mode !== 'third_party_provider'
}

export function shouldDescribeLoginAsAccountSwitch(
  session: CommandAvailabilitySession,
): boolean {
  return (
    session?.principalSource === 'direct_api_key_env' ||
    session?.principalSource === 'console_api_key'
  )
}

export function meetsAvailabilityRequirementForContext(
  cmd: Pick<Command, 'availability'>,
  params: {
    isFirstPartyBaseUrl: boolean
    session: CommandAvailabilitySession
  },
): boolean {
  if (!cmd.availability) return true

  const hasOauthAvailability = hasOauthCommandAvailabilitySession(params.session)
  const hasConsoleAvailability =
    !hasOauthAvailability &&
    shouldIncludeFirstPartyAuthCommands(params.session) &&
    params.isFirstPartyBaseUrl

  for (const availability of cmd.availability) {
    switch (availability) {
      case 'claude-ai':
        if (hasOauthAvailability) return true
        break
      case 'console':
        if (hasConsoleAvailability) return true
        break
      default: {
        const _exhaustive: never = availability
        void _exhaustive
        break
      }
    }
  }

  return false
}

export function meetsAvailabilityRequirement(
  cmd: Pick<Command, 'availability'>,
): boolean {
  return meetsAvailabilityRequirementForContext(cmd, {
    isFirstPartyBaseUrl: isFirstPartyNoumenaBaseUrl(),
    session: getCurrentCommandAvailabilitySession(),
  })
}
