import axios from 'axios'
import { hasUsableManagedRemotePrincipal } from '../../auth/capabilities/remote.js'
import { getAuthRuntime } from '../../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { logError } from '../../utils/log.js'
import { buildNoumenaPlatformUrl } from '../../utils/platformUrls.js'
import { isEssentialTrafficOnly } from '../../utils/privacyLevel.js'
import { getOAuthHeaders, prepareApiRequest } from '../../utils/teleport/api.js'

export type OverageCreditGrantInfo = {
  available: boolean
  eligible: boolean
  granted: boolean
  amount_minor_units: number | null
  currency: string | null
}

type CachedGrantEntry = {
  info: OverageCreditGrantInfo
  timestamp: number
}

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

export function canUseOverageCreditGrantForSession(
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

function getCurrentOverageCreditGrantSession(): null | ResolvedAuthSession {
  try {
    return getAuthRuntime().getCurrentSession()
  } catch {
    return null
  }
}

function getCurrentOverageCreditGrantOrgId(): null | string {
  const session = getCurrentOverageCreditGrantSession()
  if (!session || !canUseOverageCreditGrantForSession(session)) {
    return null
  }
  return session.identity.organizationUuid
}

/**
 * Fetch the current user's overage credit grant eligibility from the backend.
 * The backend resolves tier-specific amounts and role-based claim permission,
 * so the CLI just reads the response without replicating that logic.
 */
async function fetchOverageCreditGrant(): Promise<OverageCreditGrantInfo | null> {
  try {
    const { accessToken, orgUUID } = await prepareApiRequest()
    const url = buildNoumenaPlatformUrl(
      `/api/oauth/organizations/${orgUUID}/overage_credit_grant`,
    )
    const response = await axios.get<OverageCreditGrantInfo>(url, {
      headers: getOAuthHeaders(accessToken),
    })
    return response.data
  } catch (err) {
    logError(err)
    return null
  }
}

/**
 * Get cached grant info. Returns null if no cache or cache is stale.
 * Callers should render nothing (not block) when this returns null —
 * refreshOverageCreditGrantCache fires lazily to populate it.
 */
export function getCachedOverageCreditGrant(): OverageCreditGrantInfo | null {
  const orgId = getCurrentOverageCreditGrantOrgId()
  if (!orgId) return null
  const cached = getGlobalConfig().overageCreditGrantCache?.[orgId]
  if (!cached) return null
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) return null
  return cached.info
}

/**
 * Drop the current org's cached entry so the next read refetches.
 * Leaves other orgs' entries intact.
 */
export function invalidateOverageCreditGrantCache(): void {
  const orgId = getCurrentOverageCreditGrantOrgId()
  if (!orgId) return
  const cache = getGlobalConfig().overageCreditGrantCache
  if (!cache || !(orgId in cache)) return
  saveGlobalConfig(prev => {
    const next = { ...prev.overageCreditGrantCache }
    delete next[orgId]
    return { ...prev, overageCreditGrantCache: next }
  })
}

/**
 * Fetch and cache grant info. Fire-and-forget; call when an upsell surface
 * is about to render and the cache is empty.
 */
export async function refreshOverageCreditGrantCache(): Promise<void> {
  if (isEssentialTrafficOnly()) return
  const session = getCurrentOverageCreditGrantSession()
  if (!session || !canUseOverageCreditGrantForSession(session)) {
    return
  }
  const orgId = session.identity.organizationUuid
  if (!orgId) return
  const info = await fetchOverageCreditGrant()
  if (!info) return
  // Skip rewriting info if grant data is unchanged — avoids config write
  // amplification (inc-4552 pattern). Still refresh the timestamp so the
  // TTL-based staleness check in getCachedOverageCreditGrant doesn't keep
  // re-triggering API calls on every component mount.
  saveGlobalConfig(prev => {
    // Derive from prev (lock-fresh) rather than a pre-lock getGlobalConfig()
    // read — saveConfigWithLock re-reads config from disk under the file lock,
    // so another CLI instance may have written between any outer read and lock
    // acquire.
    const prevCached = prev.overageCreditGrantCache?.[orgId]
    const existing = prevCached?.info
    const dataUnchanged =
      existing &&
      existing.available === info.available &&
      existing.eligible === info.eligible &&
      existing.granted === info.granted &&
      existing.amount_minor_units === info.amount_minor_units &&
      existing.currency === info.currency
    // When data is unchanged and timestamp is still fresh, skip the write entirely
    if (
      dataUnchanged &&
      prevCached &&
      Date.now() - prevCached.timestamp <= CACHE_TTL_MS
    ) {
      return prev
    }
    const entry: CachedGrantEntry = {
      info: dataUnchanged ? existing : info,
      timestamp: Date.now(),
    }
    return {
      ...prev,
      overageCreditGrantCache: {
        ...prev.overageCreditGrantCache,
        [orgId]: entry,
      },
    }
  })
}

/**
 * Format the grant amount for display. Returns null if amount isn't available
 * (not eligible, or currency we don't know how to format).
 */
export function formatGrantAmount(info: OverageCreditGrantInfo): string | null {
  if (info.amount_minor_units == null || !info.currency) return null
  // For now only USD; backend may expand later
  if (info.currency.toUpperCase() === 'USD') {
    const dollars = info.amount_minor_units / 100
    return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
  }
  return null
}

export type { CachedGrantEntry as OverageCreditGrantCacheEntry }
