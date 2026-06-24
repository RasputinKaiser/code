import type { ResolvedAuthSession } from '../auth/runtime/types.js'

type FastModeSessionInput =
  | Pick<
      ResolvedAuthSession,
      | 'headersKind'
      | 'accessToken'
      | 'apiKey'
      | 'hasUsableToken'
      | 'hasUsableApiKey'
      | 'scopes'
    >
  | null
  | undefined

export type FastModeAuthType = 'oauth' | 'api-key'

export type FastModeFetchAuth =
  | { accessToken: string }
  | { apiKey: string }
  | null

export function getFastModeUnavailableReasonAuthType(
  session: FastModeSessionInput,
): FastModeAuthType {
  return session?.headersKind === 'bearer' && Boolean(session.accessToken)
    ? 'oauth'
    : 'api-key'
}

export function resolveFastModeFetchAuth(
  session: FastModeSessionInput,
): FastModeFetchAuth {
  if (
    session?.headersKind === 'bearer' &&
    session.hasUsableToken &&
    Boolean(session.accessToken) &&
    session.scopes.includes('user:profile')
  ) {
    return { accessToken: session.accessToken }
  }

  if (
    session?.headersKind === 'api_key' &&
    session.hasUsableApiKey &&
    Boolean(session.apiKey)
  ) {
    return { apiKey: session.apiKey }
  }

  return null
}
