import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'

type BuddyReactionSessionInput =
  | Pick<
      ResolvedAuthSession,
      'principalSource' | 'providerPlan' | 'headersKind' | 'accessToken' | 'identity'
    >
  | null
  | undefined

export interface BuddyReactionSession {
  accessToken: string
  organizationUuid: string
}

export function resolveBuddyReactionSession(
  session: BuddyReactionSessionInput,
): BuddyReactionSession | null {
  if (
    session?.principalSource !== 'managed_oauth' ||
    session.providerPlan.mode !== 'noumena_managed' ||
    session.headersKind !== 'bearer' ||
    !session.accessToken ||
    !session.identity.organizationUuid
  ) {
    return null
  }

  return {
    accessToken: session.accessToken,
    organizationUuid: session.identity.organizationUuid,
  }
}

export function getCurrentBuddyReactionSession(): BuddyReactionSession | null {
  return resolveBuddyReactionSession(getAuthRuntime().getCurrentSession())
}
