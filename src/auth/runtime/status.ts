import { getAPIProvider } from '../../utils/model/providers.js'
import type {
  AuthStatusProperty,
  AuthStatusView,
  ResolvedAuthSession,
} from './types.js'

function buildAuthMethod(session: ResolvedAuthSession): AuthStatusView['authMethod'] {
  if (session.principalSource === 'third_party_provider') {
    return 'third_party'
  }
  if (
    session.principalSource === 'managed_oauth' &&
    session.sessionState === 'expired'
  ) {
    return 'managed_oauth_expired'
  }
  if (session.principalSource === 'managed_oauth') {
    return 'managed_oauth'
  }
  if (session.principalSource === 'api_key_helper') {
    return 'api_key_helper'
  }
  if (
    session.principalSource === 'service_oauth_env' ||
    session.principalSource === 'service_oauth_fd' ||
    session.principalSource === 'external_bearer_compat'
  ) {
    return 'oauth_token'
  }
  if (session.principalSource === 'console_api_key') {
    return 'console'
  }
  if (
    session.principalSource === 'direct_api_key_env' ||
    session.principalSource === 'service_api_key_fd'
  ) {
    return 'api_key'
  }
  return 'none'
}

function buildAccountProperties(view: Omit<AuthStatusView, 'accountProperties'>): AuthStatusProperty[] {
  const properties: AuthStatusProperty[] = []
  const expiredSuffix = view.authExpired ? ' (expired)' : ''

  if (view.subscriptionName) {
    properties.push({
      label: 'Login method',
      value: `${view.subscriptionName} Account${expiredSuffix}`,
    })
  } else if (
    view.authMethod === 'managed_oauth' ||
    view.authMethod === 'managed_oauth_expired' ||
    view.authMethod === 'console'
  ) {
    properties.push({
      label: 'Login method',
      value: `Noumena Managed Account${expiredSuffix}`,
    })
  }

  if (view.authTokenSource) {
    properties.push({
      label: 'Auth token',
      value: `${view.authTokenSource}${expiredSuffix}`,
    })
  }

  if (view.apiKeySource) {
    properties.push({
      label: 'API key',
      value: view.apiKeySource,
    })
  }

  if (view.orgName && !process.env.IS_DEMO) {
    properties.push({
      label: 'Organization',
      value: view.orgName,
    })
  }

  if (view.email && !process.env.IS_DEMO) {
    properties.push({
      label: 'Email',
      value: view.email,
    })
  }

  return properties
}

export function buildAuthStatusView(
  session: ResolvedAuthSession,
): AuthStatusView {
  const authMethod = buildAuthMethod(session)
  const authExpired = authMethod === 'managed_oauth_expired'
  const loggedIn =
    session.principalSource === 'third_party_provider' ||
    session.sessionState === 'usable'

  const authTokenSource =
    session.principalSource === 'managed_oauth'
      ? 'noumena_managed'
      : authMethod === 'oauth_token' || authMethod === 'api_key_helper'
        ? session.rawAuthTokenSource
        : null

  const baseView = {
    loggedIn,
    authMethod,
    authExpired,
    apiProvider: getAPIProvider(),
    email: session.identity.email,
    orgId: session.identity.organizationUuid,
    orgName: session.identity.organizationName,
    subscriptionType: session.subscription.subscriptionType,
    subscriptionName: session.subscription.subscriptionName,
    apiKeySource: session.rawApiKeySource,
    authTokenSource,
    recoveryAction: session.recoveryAction,
    recoveryMessage: session.recoveryMessage,
  }

  return {
    ...baseView,
    accountProperties: buildAccountProperties(baseView),
  }
}
