import { hasUsableManagedRemotePrincipal } from '../../auth/capabilities/remote.js'
import { getAuthRuntime } from '../../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'
import { logForDebugging } from '../../utils/debug.js'
import { getOAuthHeaders, prepareApiRequest } from '../../utils/teleport/api.js'
import { getIdentityClient } from '../oauth/identityClient.js'

export type UltrareviewQuotaResponse = {
  reviews_used: number
  reviews_limit: number
  reviews_remaining: number
  is_overage: boolean
}

export function canFetchUltrareviewQuotaForSession(
  session: Pick<
    ResolvedAuthSession,
    'accessToken' | 'identity' | 'principalSource' | 'scopes' | 'sessionState'
  >,
): boolean {
  return (
    hasUsableManagedRemotePrincipal(session as ResolvedAuthSession) &&
    Boolean(session.identity.organizationUuid)
  )
}

/**
 * Peek the ultrareview quota for display and nudge decisions. Consume
 * happens server-side at session creation. Null when not a subscriber or
 * the endpoint errors.
 */
export async function fetchUltrareviewQuota(): Promise<UltrareviewQuotaResponse | null> {
  const session = getAuthRuntime().getCurrentSession()
  if (!canFetchUltrareviewQuotaForSession(session)) {
    return null
  }
  try {
    const { accessToken, orgUUID } = await prepareApiRequest()
    return await getIdentityClient().fetchUltrareviewQuota({
      headers: {
        ...getOAuthHeaders(accessToken),
        'x-organization-uuid': orgUUID,
      },
      timeout: 5000,
    })
  } catch (error) {
    logForDebugging(`fetchUltrareviewQuota failed: ${error}`)
    return null
  }
}
