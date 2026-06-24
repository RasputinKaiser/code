import { getAuthRuntime } from '../../auth/runtime/AuthRuntime.js'
import { getAuthHeaders } from '../../utils/http.js'
import { getNcodeUserAgent } from '../../utils/userAgent.js'
import { getIdentityClient } from '../oauth/identityClient.js'

export type RateLimit = {
  utilization: number | null // a percentage from 0 to 100
  resets_at: string | null // ISO 8601 timestamp
}

export type ExtraUsage = {
  is_enabled: boolean
  monthly_limit: number | null
  used_credits: number | null
  utilization: number | null
}

export type Utilization = {
  five_hour?: RateLimit | null
  seven_day?: RateLimit | null
  seven_day_oauth_apps?: RateLimit | null
  seven_day_opus?: RateLimit | null
  seven_day_sonnet?: RateLimit | null
  extra_usage?: ExtraUsage | null
}

export async function fetchUtilization(): Promise<Utilization | null> {
  const session = getAuthRuntime().getCurrentSession()

  const isManagedSubscriber =
    session.principalSource === 'managed_oauth' &&
    session.subscription.subscriptionType != null
  const hasProfileScope = session.scopes.includes('user:profile')

  if (!isManagedSubscriber || !hasProfileScope) {
    return {}
  }

  // Skip API call if the managed session is not currently usable to avoid 401s.
  if (session.sessionState !== 'usable' || !session.accessToken) {
    return null
  }

  const authResult = getAuthHeaders()
  if (authResult.error) {
    throw new Error(`Auth error: ${authResult.error}`)
  }

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': getNcodeUserAgent(),
    ...authResult.headers,
  }

  return await getIdentityClient().fetchUtilization({
    headers,
    timeout: 5000, // 5 second timeout
  })
}
