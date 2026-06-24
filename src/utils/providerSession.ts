import type { ResolvedAuthSession } from '../auth/runtime/types.js'

type ProviderSession =
  | Pick<ResolvedAuthSession, 'providerPlan' | 'headersKind' | 'accessToken'>
  | null
  | undefined

function getCurrentProviderSession(): ProviderSession {
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

export function isThirdPartyProviderSession(
  session: ProviderSession,
): boolean {
  return session?.providerPlan.mode === 'third_party_provider'
}

export function isCurrentThirdPartyProviderSession(): boolean {
  return isThirdPartyProviderSession(getCurrentProviderSession())
}

export function getManagedProviderAccessToken(
  session: ProviderSession,
): string {
  return session?.providerPlan.mode === 'noumena_managed' &&
    session.headersKind === 'bearer'
    ? session.accessToken ?? ''
    : ''
}

export function getCurrentManagedProviderAccessToken(): string {
  return getManagedProviderAccessToken(getCurrentProviderSession())
}
