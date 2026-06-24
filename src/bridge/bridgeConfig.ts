/**
 * Shared bridge auth/URL resolution. Consolidates the ant-only
 * CLAUDE_BRIDGE_* dev overrides that were previously copy-pasted across
 * a dozen files — inboundAttachments, BriefTool/upload, bridgeMain,
 * initReplBridge, remoteBridgeCore, daemon workers, /rename,
 * /remote-control.
 *
 * Two layers: *Override() returns the ant-only env var (or undefined);
 * the non-Override versions fall through to the canonical auth runtime.
 * Callers that compose with a different auth source (e.g. daemon workers
 * using IPC auth) use the Override getters directly.
 */

import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import { getSessionCompatiblePlatformBaseUrl } from '../utils/platformUrls.js'
import { isInternalBuild } from 'src/capabilities/static.js'

/** Ant-only dev override: CLAUDE_BRIDGE_OAUTH_TOKEN, else undefined. */
export function getBridgeTokenOverride(): string | undefined {
  return (
    (isInternalBuild() &&
      process.env.CLAUDE_BRIDGE_OAUTH_TOKEN) ||
    undefined
  )
}

/** Ant-only dev override: CLAUDE_BRIDGE_BASE_URL, else undefined. */
export function getBridgeBaseUrlOverride(): string | undefined {
  return (
    (isInternalBuild() && process.env.CLAUDE_BRIDGE_BASE_URL) ||
    undefined
  )
}

/**
 * Access token for bridge API calls: dev override first, then the OAuth
 * session tracked by the canonical auth runtime. Undefined means
 * "not logged in".
 */
export function getBridgeAccessToken(): string | undefined {
  return getBridgeTokenOverride() ?? getAuthRuntime().getCurrentSession().accessToken ?? undefined
}

/**
 * Base URL for bridge API calls: dev override first, then the production
 * session-compatible first-party platform base. Always returns a URL.
 */
export function getBridgeBaseUrl(): string {
  return getBridgeBaseUrlOverride() ?? getSessionCompatiblePlatformBaseUrl()
}
