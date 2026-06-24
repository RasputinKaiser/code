import type { ResolvedAuthSession } from '../../auth/runtime/types.js'

type AgentsPlatformSessionInput =
  | Pick<
      ResolvedAuthSession,
      | 'principalSource'
      | 'providerPlan'
      | 'headersKind'
      | 'accessToken'
      | 'identity'
    >
  | null
  | undefined

export type ScheduledRoutineApiSession =
  | {
      accessToken: string
      organizationUuid: string
    }
  | { error: string }

export function resolveScheduledRoutineApiSession(
  session: AgentsPlatformSessionInput,
): ScheduledRoutineApiSession {
  if (session?.principalSource === 'console_api_key') {
    return {
      error:
        'Authenticated with a managed API account, but scheduled routines require a subscription-backed login. Run /login and choose the subscription account path, then try again.',
    }
  }

  if (
    session?.principalSource !== 'managed_oauth' ||
    session.providerPlan.mode !== 'noumena_managed' ||
    session.headersKind !== 'bearer' ||
    !session.accessToken
  ) {
    return {
      error:
        'Not authenticated with a subscription account. Run /login and try again.',
    }
  }

  if (!session.identity.organizationUuid) {
    return {
      error: 'Unable to resolve organization UUID.',
    }
  }

  return {
    accessToken: session.accessToken,
    organizationUuid: session.identity.organizationUuid,
  }
}
