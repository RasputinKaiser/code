const LEGACY_ANALYTICS_PREFIX = 'tengu_'
const CANONICAL_ANALYTICS_PREFIX = 'ncode_'
const LEGACY_ANALYTICS_DASH_PREFIX = 'tengu-'
const CANONICAL_ANALYTICS_DASH_PREFIX = 'ncode-'

export function toCanonicalAnalyticsName(name: string): string {
  if (name.startsWith(LEGACY_ANALYTICS_PREFIX)) {
    return `${CANONICAL_ANALYTICS_PREFIX}${name.slice(LEGACY_ANALYTICS_PREFIX.length)}`
  }
  if (name.startsWith(LEGACY_ANALYTICS_DASH_PREFIX)) {
    return `${CANONICAL_ANALYTICS_DASH_PREFIX}${name.slice(LEGACY_ANALYTICS_DASH_PREFIX.length)}`
  }
  return name
}

export function toLegacyAnalyticsName(name: string): string {
  if (name.startsWith(CANONICAL_ANALYTICS_PREFIX)) {
    return `${LEGACY_ANALYTICS_PREFIX}${name.slice(CANONICAL_ANALYTICS_PREFIX.length)}`
  }
  if (name.startsWith(CANONICAL_ANALYTICS_DASH_PREFIX)) {
    return `${LEGACY_ANALYTICS_DASH_PREFIX}${name.slice(CANONICAL_ANALYTICS_DASH_PREFIX.length)}`
  }
  return name
}

export function getLegacyCompatibleAnalyticsNames(name: string): string[] {
  const canonical = toCanonicalAnalyticsName(name)
  const legacy = toLegacyAnalyticsName(canonical)
  return legacy === canonical ? [canonical] : [canonical, legacy]
}

export function getLegacyCompatibleValue<T>(
  values: Record<string, T | undefined> | undefined,
  name: string,
): T | undefined {
  if (!values) return undefined
  for (const candidate of getLegacyCompatibleAnalyticsNames(name)) {
    const value = values[candidate]
    if (value !== undefined) {
      return value
    }
  }
  return undefined
}
