import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'
import { getAPIProvider } from './model/providers.js'

type FirstPartyApiCustomerSessionInput =
  | Pick<ResolvedAuthSession, 'principalSource' | 'headersKind' | 'scopes'>
  | null
  | undefined

export function isFirstPartyApiCustomerSession(
  session: FirstPartyApiCustomerSessionInput,
  apiProvider: string,
): boolean {
  if (apiProvider !== 'firstParty') {
    return false
  }

  return !(
    session?.principalSource === 'managed_oauth' &&
    session.headersKind === 'bearer' &&
    session.scopes.includes('user:inference')
  )
}

export function isCurrentFirstPartyApiCustomer(): boolean {
  return isFirstPartyApiCustomerSession(
    getAuthRuntime().getCurrentSession(),
    getAPIProvider(),
  )
}
