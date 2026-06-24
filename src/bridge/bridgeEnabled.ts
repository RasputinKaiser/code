import { feature } from 'bun:bundle'
import {
  checkGate_CACHED_OR_BLOCKING,
  getDynamicConfig_CACHED_MAY_BE_STALE,
  getFeatureValue_CACHED_MAY_BE_STALE,
} from '../services/analytics/growthbook.js'
import { isEnvTruthy } from '../utils/envUtils.js'
import { lt } from '../utils/semver.js'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'

export type BridgeEligibilitySession =
  | Pick<ResolvedAuthSession, 'identity' | 'principalSource' | 'scopes'>
  | null
  | undefined

const BRIDGE_MANAGED_ACCOUNT_REQUIRED_MESSAGE =
  'Remote Control requires a managed Noumena account. Run `code auth login` to sign in with your Noumena account.'
const BRIDGE_FULL_SCOPE_REQUIRED_MESSAGE =
  'Remote Control requires a full-scope login token. Long-lived setup tokens and legacy OAuth env tokens are limited to inference-only for security reasons. Run `code auth login` to use Remote Control.'
const BRIDGE_ORG_REQUIRED_MESSAGE =
  'Unable to determine your organization for Remote Control eligibility. Run `code auth login` to refresh your account information.'

/**
 * Runtime check for bridge mode entitlement.
 *
 * Remote Control requires a managed Noumena OAuth principal. This excludes
 * Bedrock/Vertex/Foundry, API-key helper/gateway deployments, env-var API keys,
 * and setup-token flows because they do not carry the full OAuth scope CCR needs.
 *
 * The `feature('BRIDGE_MODE')` guard ensures the GrowthBook string literal
 * is only referenced when bridge mode is enabled at build time.
 */
export function isBridgeEnabled(): boolean {
  // Positive ternary pattern — see docs/feature-gating.md.
  // Negative pattern (if (!feature(...)) return) does not eliminate
  // inline string literals from external builds.
  return feature('BRIDGE_MODE')
    ? hasManagedBridgePrincipal(getCurrentBridgeEligibilitySession()) &&
        getFeatureValue_CACHED_MAY_BE_STALE('ncode_ccr_bridge', false)
    : false
}

/**
 * Blocking entitlement check for Remote Control.
 *
 * Returns cached `true` immediately (fast path). If the disk cache says
 * `false` or is missing, awaits GrowthBook init and fetches the fresh
 * server value (slow path, max ~5s), then writes it to disk.
 *
 * Use at entitlement gates where a stale `false` would unfairly block access.
 * For user-facing error paths, prefer `getBridgeDisabledReason()` which gives
 * a specific diagnostic. For render-body UI visibility checks, use
 * `isBridgeEnabled()` instead.
 */
export async function isBridgeEnabledBlocking(): Promise<boolean> {
  return feature('BRIDGE_MODE')
    ? hasManagedBridgePrincipal(getCurrentBridgeEligibilitySession()) &&
        (await checkGate_CACHED_OR_BLOCKING('ncode_ccr_bridge'))
    : false
}

/**
 * Diagnostic message for why Remote Control is unavailable, or null if
 * it's enabled. Call this instead of a bare `isBridgeEnabledBlocking()`
 * check when you need to show the user an actionable error.
 *
 * The GrowthBook gate targets on organizationUUID, which comes from
 * config.oauthAccount — populated by /api/oauth/profile during login.
 * That endpoint requires the user:profile scope. Tokens without it
 * (setup-token, legacy OAuth env tokens, or pre-scope-expansion
 * logins) leave oauthAccount unpopulated, so the gate falls back to
 * false and users see a dead-end "not enabled" message with no hint
 * that re-login would fix it. See CC-1165 / gh-33105.
 */
export async function getBridgeDisabledReason(): Promise<string | null> {
  if (feature('BRIDGE_MODE')) {
    const preGateReason = getBridgeEligibilityPreGateReason(
      getCurrentBridgeEligibilitySession(),
    )
    if (preGateReason) {
      return preGateReason
    }
    if (!(await checkGate_CACHED_OR_BLOCKING('ncode_ccr_bridge'))) {
      return 'Remote Control is not yet enabled for your account.'
    }
    return null
  }
  return 'Remote Control is not available in this build.'
}

export function hasManagedBridgePrincipal(
  session: BridgeEligibilitySession,
): boolean {
  return (
    session?.principalSource === 'managed_oauth' &&
    session.scopes.includes('user:inference')
  )
}

export function getBridgeEligibilityPreGateReason(
  session: BridgeEligibilitySession,
): string | null {
  if (!hasManagedBridgePrincipal(session)) {
    return BRIDGE_MANAGED_ACCOUNT_REQUIRED_MESSAGE
  }
  if (!session.scopes.includes('user:profile')) {
    return BRIDGE_FULL_SCOPE_REQUIRED_MESSAGE
  }
  if (!session.identity.organizationUuid) {
    return BRIDGE_ORG_REQUIRED_MESSAGE
  }
  return null
}

// try/catch: main.tsx calls isBridgeEnabled() while defining the Commander
// program, before configs are enabled. Resolve bridge-eligibility session
// lazily so pre-config access still fails closed to "not enabled" rather than
// poisoning startup with a config read.
function getCurrentBridgeEligibilitySession(): BridgeEligibilitySession {
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

/**
 * Runtime check for the env-less (v2) REPL bridge path.
 * Returns true when the GrowthBook flag `ncode_bridge_repl_v2` is enabled.
 *
 * This gates which implementation initReplBridge uses — NOT whether bridge
 * is available at all (see isBridgeEnabled above). Daemon/print paths stay
 * on the env-based implementation regardless of this gate.
 */
export function isEnvLessBridgeEnabled(): boolean {
  return feature('BRIDGE_MODE')
    ? getFeatureValue_CACHED_MAY_BE_STALE('ncode_bridge_repl_v2', false)
    : false
}

/**
 * Kill-switch for the `cse_*` → `session_*` client-side retag shim.
 *
 * The shim exists because compat/convert.go:27 validates TagSession and the
 * web frontend routes on `session_*`, while v2 worker endpoints hand out
 * `cse_*`. Once the server tags by environment_kind and the frontend accepts
 * `cse_*` directly, flip this to false to make toCompatSessionId a no-op.
 * Defaults to true — the shim stays active until explicitly disabled.
 */
export function isCseShimEnabled(): boolean {
  return feature('BRIDGE_MODE')
    ? getFeatureValue_CACHED_MAY_BE_STALE(
        'ncode_bridge_repl_v2_cse_shim_enabled',
        true,
      )
    : true
}

/**
 * Returns an error message if the current CLI version is below the
 * minimum required for the v1 (env-based) Remote Control path, or null if the
 * version is fine. The v2 (env-less) path uses checkEnvLessBridgeMinVersion()
 * in envLessBridgeConfig.ts instead — the two implementations have independent
 * version floors.
 *
 * Uses cached (non-blocking) GrowthBook config. If GrowthBook hasn't
 * loaded yet, the default '0.0.0' means the check passes — a safe fallback.
 */
export function checkBridgeMinVersion(): string | null {
  // Positive pattern — see docs/feature-gating.md.
  // Negative pattern (if (!feature(...)) return) does not eliminate
  // inline string literals from external builds.
  if (feature('BRIDGE_MODE')) {
    const config = getDynamicConfig_CACHED_MAY_BE_STALE<{
      minVersion: string
    }>('ncode_bridge_min_version', { minVersion: '0.0.0' })
    if (config.minVersion && lt(MACRO.VERSION, config.minVersion)) {
      return `Your version of Code (${MACRO.VERSION}) is too old for Remote Control.\nVersion ${config.minVersion} or higher is required. Run \`code update\` to update.`
    }
  }
  return null
}

/**
 * Default for remoteControlAtStartup when the user hasn't explicitly set it.
 * When the CCR_AUTO_CONNECT build flag is present (ant-only) and the
 * ncode_cobalt_harbor GrowthBook gate is on, all sessions connect to CCR by
 * default — the user can still opt out by setting remoteControlAtStartup=false
 * in config (explicit settings always win over this default).
 *
 * Defined here rather than in config.ts to avoid a direct
 * config.ts → growthbook.ts import cycle (growthbook.ts → user.ts → config.ts).
 */
export function getCcrAutoConnectDefault(): boolean {
  return feature('CCR_AUTO_CONNECT')
    ? getFeatureValue_CACHED_MAY_BE_STALE('ncode_cobalt_harbor', false)
    : false
}

/**
 * Opt-in CCR mirror mode — every local session spawns an outbound-only
 * Remote Control session that receives forwarded events. Separate from
 * getCcrAutoConnectDefault (bidirectional Remote Control). Env var wins for
 * local opt-in; GrowthBook controls rollout.
 */
export function isCcrMirrorEnabled(): boolean {
  return feature('CCR_MIRROR')
    ? isEnvTruthy(process.env.CLAUDE_CODE_CCR_MIRROR) ||
        getFeatureValue_CACHED_MAY_BE_STALE('ncode_ccr_mirror', false)
    : false
}
