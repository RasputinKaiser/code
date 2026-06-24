import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'

type ConsoleOAuthSessionInput =
  | Pick<
      ResolvedAuthSession,
      | 'identity'
      | 'headersKind'
      | 'hasUsableToken'
      | 'principalSource'
      | 'providerAuthKind'
      | 'rawApiKeySource'
      | 'sessionState'
    >
  | null
  | undefined

export interface ConsoleOAuthSessionState {
  email: string | null
  canReuseManagedLogin: boolean
  canReuseConsoleLogin: boolean
}

export function buildConsoleOAuthSessionState(
  session: ConsoleOAuthSessionInput,
): ConsoleOAuthSessionState {
  const isUsableFirstPartyBearer =
    session?.sessionState === 'usable' &&
    session.providerAuthKind === 'noumena_first_party' &&
    session.headersKind === 'bearer' &&
    session.hasUsableToken

  const canReuseManagedLogin =
    isUsableFirstPartyBearer && session.principalSource === 'managed_oauth'

  const canReuseConsoleLogin =
    session?.sessionState === 'usable' &&
    session.providerAuthKind === 'noumena_first_party' &&
    (session.principalSource === 'console_api_key' ||
      session.rawApiKeySource === '/login managed key')

  return {
    email: session?.identity.email ?? null,
    canReuseManagedLogin,
    canReuseConsoleLogin,
  }
}

export function getCurrentConsoleOAuthSessionState(): ConsoleOAuthSessionState {
  return buildConsoleOAuthSessionState(getAuthRuntime().getCurrentSession())
}
