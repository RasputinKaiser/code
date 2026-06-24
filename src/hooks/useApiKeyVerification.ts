import { useCallback, useState } from 'react'
import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import type {
  PrincipalSource,
  ProviderMode,
  ResolvedAuthSession,
} from '../auth/runtime/types.js'
import { verifyApiKey } from '../services/api/claude.js'
import { resolveApiKeyVerificationSession } from '../utils/apiKeyHelperSession.js'
import { isBareMode } from '../utils/envUtils.js'
import { getAPIProvider } from '../utils/model/providers.js'

export type VerificationStatus =
  | 'loading'
  | 'valid'
  | 'invalid'
  | 'missing'
  | 'error'

export type ApiKeyVerificationResult = {
  status: VerificationStatus
  reverify: () => Promise<void>
  error: Error | null
}

export function shouldSkipApiKeyVerificationForAuthState(options: {
  apiProvider: string
  bareMode: boolean
  providerMode: ProviderMode
  principalSource: PrincipalSource
  hasAuthToken: boolean
}): boolean {
  return (
    options.bareMode ||
    options.apiProvider !== 'firstParty' ||
    options.providerMode === 'third_party_provider' ||
    options.providerMode === 'byok_static_env' ||
    options.principalSource === 'managed_oauth' ||
    options.hasAuthToken
  )
}

export function shouldSkipApiKeyVerification(): boolean {
  const session = getAuthRuntime().getCurrentSession()
  return shouldSkipApiKeyVerificationForAuthState({
    apiProvider: getAPIProvider(),
    bareMode: isBareMode(),
    providerMode: session.providerPlan.mode,
    principalSource: session.principalSource,
    hasAuthToken: session.hasUsableToken,
  })
}

type ApiKeyVerificationSessionInput =
  | Pick<ResolvedAuthSession, 'apiKey' | 'rawApiKeySource'>
  | null
  | undefined

export function getInitialApiKeyVerificationStatus(
  session: ApiKeyVerificationSessionInput,
): VerificationStatus {
  if (session?.apiKey || session?.rawApiKeySource === 'apiKeyHelper') {
    return 'loading'
  }
  return 'missing'
}

export function useApiKeyVerification(): ApiKeyVerificationResult {
  const [status, setStatus] = useState<VerificationStatus>(() => {
    if (shouldSkipApiKeyVerification()) {
      return 'valid'
    }

    return getInitialApiKeyVerificationStatus(
      getAuthRuntime().getCurrentSession(),
    )
  })
  const [error, setError] = useState<Error | null>(null)

  const verify = useCallback(async (): Promise<void> => {
    if (shouldSkipApiKeyVerification()) {
      setStatus('valid')
      return
    }
    const session = await resolveApiKeyVerificationSession()
    const apiKey = session.apiKey
    const source = session.rawApiKeySource
    if (!apiKey) {
      if (source === 'apiKeyHelper') {
        setStatus('error')
        setError(new Error('API key helper did not return a valid key'))
        return
      }
      const newStatus = 'missing'
      setStatus(newStatus)
      return
    }

    try {
      const isValid = await verifyApiKey(apiKey, false)
      const newStatus = isValid ? 'valid' : 'invalid'
      setStatus(newStatus)
      return
    } catch (error) {
      // This happens when there an error response from the API but it's not an invalid API key error
      // In this case, we still mark the API key as invalid - but we also log the error so we can
      // display it to the user to be more helpful
      setError(error as Error)
      const newStatus = 'error'
      setStatus(newStatus)
      return
    }
  }, [])

  return {
    status,
    reverify: verify,
    error,
  }
}
