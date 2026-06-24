import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'
import { hasOauthCommandAvailabilitySession } from './commandAvailability.js'
import { has1mContext } from './context.js'

export function isBilledAsExtraUsageForSession(
  session:
    | Pick<ResolvedAuthSession, 'headersKind' | 'providerPlan' | 'scopes'>
    | null
    | undefined,
  model: string | null,
  isFastMode: boolean,
  isOpus1mMerged: boolean,
): boolean {
  if (!hasOauthCommandAvailabilitySession(session)) return false
  if (isFastMode) return true
  if (model === null || !has1mContext(model)) return false

  const m = model
    .toLowerCase()
    .replace(/\[1m\]$/, '')
    .trim()
  const isOpus46 = m === 'opus' || m.includes('opus-4-6')
  const isSonnet46 = m === 'sonnet' || m.includes('sonnet-4-6')

  if (isOpus46 && isOpus1mMerged) return false

  return isOpus46 || isSonnet46
}

export function isBilledAsExtraUsage(
  model: string | null,
  isFastMode: boolean,
  isOpus1mMerged: boolean,
): boolean {
  return isBilledAsExtraUsageForSession(
    getAuthRuntime().getCurrentSession(),
    model,
    isFastMode,
    isOpus1mMerged,
  )
}
