import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import { formatDuration } from './format.js'
import {
  clearApiKeyHelperCache,
  getApiKeyHelperElapsedMs,
  getConfiguredApiKeyHelper,
  prefetchApiKeyFromApiKeyHelperIfSafe,
} from './auth.js'

export function getApiKeyHelperSlowNoticeDuration(options: {
  configured: boolean
  elapsedMs: number
}): string | null {
  if (!options.configured || options.elapsedMs < 10_000) {
    return null
  }

  return formatDuration(options.elapsedMs)
}

export function hasConfiguredApiKeyHelper(): boolean {
  return Boolean(getConfiguredApiKeyHelper())
}

export function getCurrentApiKeyHelperSlowNoticeDuration(): string | null {
  return getApiKeyHelperSlowNoticeDuration({
    configured: hasConfiguredApiKeyHelper(),
    elapsedMs: getApiKeyHelperElapsedMs(),
  })
}

export function prefetchCurrentApiKeyHelperIfSafe(
  isNonInteractiveSession: boolean,
): void {
  prefetchApiKeyFromApiKeyHelperIfSafe(isNonInteractiveSession)
}

export function clearCurrentApiKeyHelperCache(): void {
  clearApiKeyHelperCache()
}

export async function resolveApiKeyVerificationSession() {
  return getAuthRuntime().resolveSession()
}
