import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'
import { getAPIProvider } from '../utils/model/providers.js'

export interface SdkAccountInfo {
  subscription?: string
  tokenSource?: string
  apiKeySource?: string
  organization?: string
  email?: string
  authTokenExpired?: boolean
}

type SdkAccountSessionInput = Pick<
  ResolvedAuthSession,
  | 'principalSource'
  | 'sessionState'
  | 'subscription'
  | 'identity'
  | 'rawAuthTokenSource'
  | 'rawApiKeySource'
  | 'hasUsableApiKey'
>

export function buildSdkAccountInfo(params: {
  apiProvider: string
  session: SdkAccountSessionInput
}): SdkAccountInfo | undefined {
  if (params.apiProvider !== 'firstParty') {
    return undefined
  }

  const { session } = params
  const accountInfo: SdkAccountInfo = {}

  if (session.principalSource === 'managed_oauth') {
    accountInfo.subscription =
      session.subscription.subscriptionName ?? 'Noumena Managed'
  } else {
    accountInfo.tokenSource = session.rawAuthTokenSource ?? 'none'
  }

  if (session.hasUsableApiKey && session.rawApiKeySource) {
    accountInfo.apiKeySource = session.rawApiKeySource
  }

  if (
    session.principalSource === 'managed_oauth' &&
    session.sessionState === 'expired'
  ) {
    accountInfo.authTokenExpired = true
  }

  const hasManagedAccountContext =
    session.principalSource === 'managed_oauth' ||
    session.principalSource === 'console_api_key'

  if (hasManagedAccountContext) {
    if (session.identity.organizationName) {
      accountInfo.organization = session.identity.organizationName
    }
    if (session.identity.email) {
      accountInfo.email = session.identity.email
    }
  }

  return accountInfo
}

export function getCurrentSdkAccountInfo(): SdkAccountInfo | undefined {
  return buildSdkAccountInfo({
    apiProvider: getAPIProvider(),
    session: getAuthRuntime().getCurrentSession(),
  })
}
