import type { OAuthTokens } from '../../services/oauth/types.js'

export type PrincipalKind =
  | 'none'
  | 'noumena_account'
  | 'api_key_user'
  | 'service_principal'
  | 'third_party_provider'

export type PrincipalSource =
  | 'managed_oauth'
  | 'console_api_key'
  | 'direct_api_key_env'
  | 'api_key_helper'
  | 'service_oauth_env'
  | 'service_oauth_fd'
  | 'service_api_key_fd'
  | 'external_bearer_compat'
  | 'third_party_provider'
  | 'none'

export type SessionState =
  | 'unauthenticated'
  | 'usable'
  | 'refreshable'
  | 'reauth_required'
  | 'expired'
  | 'invalid'

export type ProviderAuthKind =
  | 'noumena_first_party'
  | 'byok_static_env'
  | 'third_party_provider'
  | 'none'

export type ProviderMode =
  | 'none'
  | 'noumena_managed'
  | 'byok_static_env'
  | 'third_party_provider'

export type ProviderSource =
  | 'none'
  | 'managed_principal'
  | 'console_api_key'
  | 'direct_api_key_env'
  | 'api_key_helper'
  | 'service_credential'
  | 'third_party_provider'

export interface ProviderPlan {
  mode: ProviderMode
  source: ProviderSource
  staticKeyEnvVarName: string | null
}

export type HeadersKind = 'bearer' | 'api_key' | 'none'

export type RecoveryAction =
  | 'none'
  | 'run_auth_login'
  | 'run_auth_login_managed'
  | 'check_api_key'
  | 'check_service_credential'
  | 'unsupported_in_noninteractive'

export interface SourceDetails {
  usedLegacyCompat: boolean
  usedEnvVar: boolean
  usedFileDescriptor: boolean
  usedHelper: boolean
}

export interface PrincipalIdentity {
  email: string | null
  accountUuid: string | null
  organizationUuid: string | null
  organizationName: string | null
}

export interface SubscriptionInfo {
  subscriptionName: string | null
  subscriptionType: string | null
  rateLimitTier: string | null
}

export interface ResolvedAuthSession {
  principalKind: PrincipalKind
  principalSource: PrincipalSource
  sessionState: SessionState
  headersKind: HeadersKind
  providerAuthKind: ProviderAuthKind
  providerPlan: ProviderPlan

  isInteractive: boolean
  canRefresh: boolean
  canReauthenticateInteractively: boolean

  identity: PrincipalIdentity
  subscription: SubscriptionInfo
  scopes: string[]

  hasUsableToken: boolean
  hasUsableApiKey: boolean

  accessToken: string | null
  accessTokenExpiresAt: number | null
  refreshTokenPresent: boolean
  apiKey: string | null

  rawAuthTokenSource: string | null
  rawApiKeySource: string | null

  recoveryAction: RecoveryAction
  recoveryMessage: string | null

  sourceDetails: SourceDetails
}

export interface ResolveSessionOptions {
  allowRefresh?: boolean
  forceRefresh?: boolean
}

export interface BuildFirstPartyHeadersOptions {
  apiKey?: string
  includeApiKeyHeader?: boolean
  allowRefresh?: boolean
}

export interface AuthRuntime {
  resolveSession(
    options?: ResolveSessionOptions,
  ): Promise<ResolvedAuthSession>
  getCurrentSession(): ResolvedAuthSession
  getCurrentManagedSession(): null | ResolvedAuthSession
  getCurrentManagedRefreshToken(): null | string
  recoverManagedOAuth401(failedAccessToken: string): Promise<boolean>
  persistStoredApiKey(apiKey: string): Promise<void>
  persistOAuthTokensIfNeeded(tokens: OAuthTokens): {
    success: boolean
    warning?: string
  }
  clearManagedTokenCache(): void
  removeStoredApiKey(): Promise<void>
  getCachedSession(): ResolvedAuthSession | null
  buildFirstPartyHeaders(
    options?: BuildFirstPartyHeadersOptions,
  ): Promise<Record<string, string>>
  getStatusView(): Promise<AuthStatusView>
}

export interface AuthStatusProperty {
  label: string
  value: string
}

export interface AuthStatusView {
  loggedIn: boolean
  authMethod:
    | 'third_party'
    | 'managed_oauth_expired'
    | 'managed_oauth'
    | 'api_key_helper'
    | 'oauth_token'
    | 'api_key'
    | 'console'
    | 'none'
  authExpired: boolean
  apiProvider: string
  email: string | null
  orgId: string | null
  orgName: string | null
  subscriptionType: string | null
  subscriptionName: string | null
  apiKeySource: string | null
  authTokenSource: string | null
  recoveryAction: RecoveryAction
  recoveryMessage: string | null
  accountProperties: AuthStatusProperty[]
}
