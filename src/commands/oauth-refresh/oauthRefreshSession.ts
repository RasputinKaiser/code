import type { ResolvedAuthSession } from '../../auth/runtime/types.js'

type OAuthRefreshSessionInput =
  | Pick<
      ResolvedAuthSession,
      | 'principalSource'
      | 'headersKind'
      | 'accessToken'
      | 'accessTokenExpiresAt'
      | 'refreshTokenPresent'
      | 'scopes'
      | 'identity'
      | 'rawAuthTokenSource'
    >
  | null
  | undefined

export interface OAuthRefreshSessionState {
  source: string
  hasOAuthAccessToken: boolean
  hasRefreshToken: boolean
  expiresAt: number | null
  scopes: string[]
  accountEmail: string | null
  organizationUuid: string | null
}

export function formatOAuthRefreshExpiry(expiresAt: number | null): string {
  if (!expiresAt) {
    return 'unknown'
  }
  const now = Date.now()
  const remainingSec = Math.floor((expiresAt - now) / 1000)
  const iso = new Date(expiresAt).toISOString()
  return `${iso} (${remainingSec}s remaining)`
}

export function buildOAuthRefreshSessionState(
  session: OAuthRefreshSessionInput,
): OAuthRefreshSessionState {
  const hasOAuthAccessToken =
    session?.headersKind === 'bearer' && Boolean(session.accessToken)

  return {
    source: session?.rawAuthTokenSource ?? session?.principalSource ?? 'none',
    hasOAuthAccessToken,
    hasRefreshToken: Boolean(session?.refreshTokenPresent),
    expiresAt: session?.accessTokenExpiresAt ?? null,
    scopes: session?.scopes ?? [],
    accountEmail: session?.identity.email ?? null,
    organizationUuid: session?.identity.organizationUuid ?? null,
  }
}

export function getOAuthRefreshRequestedScopes(
  session: OAuthRefreshSessionInput,
): string[] | undefined {
  const scopes = session?.scopes ?? []
  return scopes.includes('user:inference') ? undefined : scopes
}

export function buildOAuthRefreshStatusReport(
  session: OAuthRefreshSessionInput,
): string {
  const state = buildOAuthRefreshSessionState(session)

  if (!state.hasOAuthAccessToken) {
    return [
      'OAuth refresh status',
      `- auth source: ${state.source}`,
      '- oauth token: missing',
      '- refresh token: missing',
    ].join('\n')
  }

  return [
    'OAuth refresh status',
    `- auth source: ${state.source}`,
    '- oauth token: present',
    `- refresh token: ${state.hasRefreshToken ? 'present' : 'missing'}`,
    `- expires at: ${formatOAuthRefreshExpiry(state.expiresAt)}`,
    `- scopes: ${state.scopes.join(', ')}`,
    `- account: ${state.accountEmail ?? '<unknown>'}`,
    `- org: ${state.organizationUuid ?? '<unknown>'}`,
  ].join('\n')
}
