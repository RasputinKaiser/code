import {
  getSessionIngressToken,
  setSessionIngressToken,
} from '../bootstrap/state.js'
import {
  buildSessionIngressLease,
  type IssuedRuntimeLease,
} from '../auth/runtime/leases.js'
import type {
  LeaseExecutionTarget,
  LeaseProviderMode,
  LeaseRenewalOwner,
  LeaseState,
} from '../auth/runtime/leases.js'
import {
  CCR_SESSION_INGRESS_TOKEN_PATH,
  maybePersistTokenForSubprocesses,
  readTokenFromWellKnownFile,
} from './authFileDescriptor.js'
import { logForDebugging } from './debug.js'
import { errorMessage } from './errors.js'
import { getFsImplementation } from './fsOperations.js'

const SESSION_INGRESS_LEASE_STATE_VALUES = new Set<LeaseState>([
  'usable',
  'renewing',
  'grace_period',
  'degraded',
  'reauth_required',
  'revoked',
  'expired',
])

const SESSION_INGRESS_LEASE_EXECUTION_TARGET_VALUES =
  new Set<LeaseExecutionTarget>(['local', 'remote', 'byoc'])

const SESSION_INGRESS_LEASE_PROVIDER_MODE_VALUES =
  new Set<LeaseProviderMode>([
    'noumena_managed',
    'byok',
    'third_party_provider',
  ])

const SESSION_INGRESS_LEASE_RENEWAL_OWNER_VALUES =
  new Set<LeaseRenewalOwner>([
    'none',
    'local_runtime',
    'remote_control_plane',
    'bridge_control_plane',
    'session_runtime',
    'byoc_control_plane',
    'provider_binding_manager',
  ])

function parseLeaseState(value: string | undefined): LeaseState | null {
  if (!value || !SESSION_INGRESS_LEASE_STATE_VALUES.has(value as LeaseState)) {
    return null
  }
  return value as LeaseState
}

function parseLeaseExecutionTarget(
  value: string | undefined,
): LeaseExecutionTarget | null {
  if (
    !value ||
    !SESSION_INGRESS_LEASE_EXECUTION_TARGET_VALUES.has(
      value as LeaseExecutionTarget,
    )
  ) {
    return null
  }
  return value as LeaseExecutionTarget
}

function parseLeaseProviderMode(
  value: string | undefined,
): LeaseProviderMode | null {
  if (
    !value ||
    !SESSION_INGRESS_LEASE_PROVIDER_MODE_VALUES.has(value as LeaseProviderMode)
  ) {
    return null
  }
  return value as LeaseProviderMode
}

function parseLeaseRenewalOwner(
  value: string | undefined,
): LeaseRenewalOwner | null {
  if (
    !value ||
    !SESSION_INGRESS_LEASE_RENEWAL_OWNER_VALUES.has(
      value as LeaseRenewalOwner,
    )
  ) {
    return null
  }
  return value as LeaseRenewalOwner
}

function parseBooleanFlag(value: string | undefined): boolean | null {
  if (value === '1') return true
  if (value === '0') return false
  return null
}

function parseSessionIdFromLeaseId(leaseId: string | undefined): string | null {
  if (!leaseId) {
    return null
  }

  const match = /^session_ingress:([^:]+):/.exec(leaseId)
  if (!match) {
    return null
  }

  return match[1] === 'detached' ? null : match[1]
}

/**
 * Read token via file descriptor, falling back to well-known file.
 * Uses global state to cache the result since file descriptors can only be read once.
 */
function getTokenFromFileDescriptor(): string | null {
  // Check if we've already attempted to read the token
  const cachedToken = getSessionIngressToken()
  if (cachedToken !== undefined) {
    return cachedToken
  }

  const fdEnv = process.env.CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR
  if (!fdEnv) {
    // No FD env var — either we're not in CCR, or we're a subprocess whose
    // parent stripped the (useless) FD env var. Try the well-known file.
    const path =
      process.env.CLAUDE_SESSION_INGRESS_TOKEN_FILE ??
      CCR_SESSION_INGRESS_TOKEN_PATH
    const fromFile = readTokenFromWellKnownFile(path, 'session ingress token')
    setSessionIngressToken(fromFile)
    return fromFile
  }

  const fd = parseInt(fdEnv, 10)
  if (Number.isNaN(fd)) {
    logForDebugging(
      `CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR must be a valid file descriptor number, got: ${fdEnv}`,
      { level: 'error' },
    )
    setSessionIngressToken(null)
    return null
  }

  try {
    // Read from the file descriptor
    // Use /dev/fd on macOS/BSD, /proc/self/fd on Linux
    const fsOps = getFsImplementation()
    const fdPath =
      process.platform === 'darwin' || process.platform === 'freebsd'
        ? `/dev/fd/${fd}`
        : `/proc/self/fd/${fd}`

    const token = fsOps.readFileSync(fdPath, { encoding: 'utf8' }).trim()
    if (!token) {
      logForDebugging('File descriptor contained empty token', {
        level: 'error',
      })
      setSessionIngressToken(null)
      return null
    }
    logForDebugging(`Successfully read token from file descriptor ${fd}`)
    setSessionIngressToken(token)
    maybePersistTokenForSubprocesses(
      CCR_SESSION_INGRESS_TOKEN_PATH,
      token,
      'session ingress token',
    )
    return token
  } catch (error) {
    logForDebugging(
      `Failed to read token from file descriptor ${fd}: ${errorMessage(error)}`,
      { level: 'error' },
    )
    // FD env var was set but read failed — typically a subprocess that
    // inherited the env var but not the FD (ENXIO). Try the well-known file.
    const path =
      process.env.CLAUDE_SESSION_INGRESS_TOKEN_FILE ??
      CCR_SESSION_INGRESS_TOKEN_PATH
    const fromFile = readTokenFromWellKnownFile(path, 'session ingress token')
    setSessionIngressToken(fromFile)
    return fromFile
  }
}

/**
 * Get session ingress authentication token.
 *
 * Priority order:
 *  1. Environment variable (CLAUDE_CODE_SESSION_ACCESS_TOKEN) — set at spawn time,
 *     updated in-process via updateSessionIngressAuthToken or
 *     update_environment_variables stdin message from the parent bridge process.
 *  2. File descriptor (legacy path) — CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR,
 *     read once and cached.
 *  3. Well-known file — CLAUDE_SESSION_INGRESS_TOKEN_FILE env var path, or
 *     the legacy CCR contract path
 *     /home/claude/.ncode/remote/.session_ingress_token. Covers subprocesses
 *     that can't inherit the FD.
 */
export function getSessionIngressAuthToken(): string | null {
  // 1. Check environment variable
  const envToken = process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN
  if (envToken) {
    return envToken
  }

  // 2. Check file descriptor (legacy path), with file fallback
  return getTokenFromFileDescriptor()
}

export function getSessionIngressRuntimeLease(): IssuedRuntimeLease | null {
  const token = getSessionIngressAuthToken()
  if (!token) {
    return null
  }

  const explicitLeaseId = process.env.NCODE_SESSION_INGRESS_LEASE_ID
  const explicitState = parseLeaseState(
    process.env.NCODE_SESSION_INGRESS_LEASE_STATE,
  )
  const explicitExecutionTarget = parseLeaseExecutionTarget(
    process.env.NCODE_SESSION_INGRESS_LEASE_EXECUTION_TARGET,
  )
  const explicitProviderMode = parseLeaseProviderMode(
    process.env.NCODE_SESSION_INGRESS_LEASE_PROVIDER_MODE,
  )
  const explicitRenewable = parseBooleanFlag(
    process.env.NCODE_SESSION_INGRESS_LEASE_RENEWABLE,
  )
  const explicitRenewalOwner = parseLeaseRenewalOwner(
    process.env.NCODE_SESSION_INGRESS_LEASE_RENEWAL_OWNER,
  )
  const explicitOrganizationUuid =
    process.env.NCODE_SESSION_INGRESS_LEASE_ORGANIZATION_UUID ??
    process.env.CLAUDE_CODE_ORGANIZATION_UUID ??
    null
  const explicitTokenTransport =
    process.env.NCODE_SESSION_INGRESS_LEASE_TOKEN_TRANSPORT

  const fallbackLease = buildSessionIngressLease({
    executionTarget:
      explicitExecutionTarget && explicitExecutionTarget !== 'local'
        ? explicitExecutionTarget
        : 'remote',
    organizationUuid: explicitOrganizationUuid,
    providerMode:
      explicitProviderMode && explicitProviderMode !== 'third_party_provider'
        ? explicitProviderMode
        : undefined,
    sessionId: parseSessionIdFromLeaseId(explicitLeaseId),
    token,
  })

  const explicitLeaseKind = process.env.NCODE_SESSION_INGRESS_LEASE_KIND
  if (explicitLeaseKind && explicitLeaseKind !== 'session_ingress') {
    return fallbackLease
  }

  return {
    ...fallbackLease,
    leaseId: explicitLeaseId ?? fallbackLease.leaseId,
    sessionId:
      parseSessionIdFromLeaseId(explicitLeaseId) ?? fallbackLease.sessionId,
    state: explicitState ?? fallbackLease.state,
    renewable: explicitRenewable ?? fallbackLease.renewable,
    renewalOwner: explicitRenewalOwner ?? fallbackLease.renewalOwner,
    executionTarget: explicitExecutionTarget ?? fallbackLease.executionTarget,
    providerMode: explicitProviderMode ?? fallbackLease.providerMode,
    organizationUuid: explicitOrganizationUuid ?? fallbackLease.organizationUuid,
    metadata: {
      ...fallbackLease.metadata,
      tokenTransport:
        explicitTokenTransport ?? fallbackLease.metadata.tokenTransport,
    },
  }
}

/**
 * Build auth headers for the current session token.
 * Session keys (sk-ant-sid) use Cookie auth + X-Organization-Uuid;
 * JWTs use Bearer auth.
 */
export function getSessionIngressAuthHeaders(): Record<string, string> {
  const lease = getSessionIngressRuntimeLease()
  if (!lease) return {}

  const token = getSessionIngressAuthToken()
  if (!token) return {}

  if (lease.metadata.tokenTransport === 'cookie') {
    const headers: Record<string, string> = {
      Cookie: `sessionKey=${token}`,
    }
    const orgUuid =
      lease.organizationUuid ?? process.env.CLAUDE_CODE_ORGANIZATION_UUID
    if (orgUuid) {
      headers['X-Organization-Uuid'] = orgUuid
    }
    return headers
  }
  return { Authorization: `Bearer ${token}` }
}

/**
 * Update the session ingress auth token in-process by setting the env var.
 * Used by the REPL bridge to inject a fresh token after reconnection
 * without restarting the process.
 */
export function updateSessionIngressAuthToken(token: string): void {
  process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN = token
}

export function updateSessionIngressRuntimeLease(
  lease: IssuedRuntimeLease,
): void {
  process.env.NCODE_SESSION_INGRESS_LEASE_ID = lease.leaseId
  process.env.NCODE_SESSION_INGRESS_LEASE_KIND = lease.leaseKind
  process.env.NCODE_SESSION_INGRESS_LEASE_STATE = lease.state
  process.env.NCODE_SESSION_INGRESS_LEASE_EXECUTION_TARGET =
    lease.executionTarget
  process.env.NCODE_SESSION_INGRESS_LEASE_PROVIDER_MODE = lease.providerMode
  process.env.NCODE_SESSION_INGRESS_LEASE_RENEWABLE = lease.renewable
    ? '1'
    : '0'
  process.env.NCODE_SESSION_INGRESS_LEASE_RENEWAL_OWNER = lease.renewalOwner
  process.env.NCODE_SESSION_INGRESS_LEASE_TOKEN_TRANSPORT = String(
    lease.metadata.tokenTransport ?? 'bearer',
  )

  if (lease.organizationUuid) {
    process.env.NCODE_SESSION_INGRESS_LEASE_ORGANIZATION_UUID =
      lease.organizationUuid
  } else {
    delete process.env.NCODE_SESSION_INGRESS_LEASE_ORGANIZATION_UUID
  }
}

export function updateSessionIngressRuntimeAuth(params: {
  token: string
  sessionId?: string | null
  organizationUuid?: string | null
  executionTarget?: Exclude<LeaseExecutionTarget, 'local'>
  providerMode?: Exclude<LeaseProviderMode, 'third_party_provider'>
}): void {
  updateSessionIngressAuthToken(params.token)
  updateSessionIngressRuntimeLease(
    buildSessionIngressLease({
      executionTarget: params.executionTarget,
      organizationUuid: params.organizationUuid,
      providerMode: params.providerMode,
      sessionId: params.sessionId,
      token: params.token,
    }),
  )
}
