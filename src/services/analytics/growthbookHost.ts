export function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

export const INTERNAL_NOUMENA_GROWTHBOOK_API_HOST_EXAMPLE =
  'https://flags.internal.noumena.test'

// Public builds have no hardcoded feature-config host. Internal builds may still
// set one via NOUMENA_GROWTHBOOK_API_HOST, NOUMENA_PLATFORM_BASE_URL, or the
// legacy CLAUDE_CODE_GB_BASE_URL override.
export function isGrowthBookStagingHost(host: string): boolean {
  return normalizeUrl(host) === INTERNAL_NOUMENA_GROWTHBOOK_API_HOST_EXAMPLE
}

export function deriveGrowthBookApiHost(platformBaseUrl: string): string {
  const normalized = normalizeUrl(platformBaseUrl)

  try {
    const parsed = new URL(normalized)
    if (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      parsed.hostname.startsWith('api.')
    ) {
      parsed.hostname = `flags.${parsed.hostname.slice('api.'.length)}`
      parsed.pathname = ''
      parsed.search = ''
      parsed.hash = ''
      return normalizeUrl(parsed.toString())
    }
  } catch {
    // Preserve the caller-provided base URL if it is not a valid URL.
  }

  return normalized
}

export function resolveGrowthBookApiHost(options: {
  noumenaOverride?: string
  platformBaseUrl?: string
  legacyAnthropicOverride?: string
}): string | undefined {
  const noumenaOverride = options.noumenaOverride?.trim()
  if (noumenaOverride) {
    return normalizeUrl(noumenaOverride)
  }

  const legacyAnthropicOverride = options.legacyAnthropicOverride?.trim()
  if (legacyAnthropicOverride) {
    return normalizeUrl(legacyAnthropicOverride)
  }

  const platformBaseUrl = options.platformBaseUrl?.trim()
  if (platformBaseUrl) {
    return deriveGrowthBookApiHost(platformBaseUrl)
  }

  // Public builds must configure a feature-config host explicitly. There is no
  // hardcoded default to avoid routing real users to staging or internal hosts.
  return undefined
}
