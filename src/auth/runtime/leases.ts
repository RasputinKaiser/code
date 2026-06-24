import type { RemoteCredentials } from '../../bridge/codeSessionApi.js'
import type {
  RecoveryAction,
  ResolvedAuthSession,
  SessionState,
} from './types.js'

export type LeaseKind =
  | 'local_first_party'
  | 'remote_session'
  | 'bridge_worker'
  | 'session_ingress'
  | 'byoc_execution'
  | 'provider_binding'

export type LeaseState =
  | 'usable'
  | 'renewing'
  | 'grace_period'
  | 'degraded'
  | 'reauth_required'
  | 'revoked'
  | 'expired'

export type DegradationMode =
  | 'none'
  | 'checkpoint_only'
  | 'read_only'
  | 'resume_required'

export type LeaseExecutionTarget = 'local' | 'remote' | 'byoc'

export type LeaseProviderMode =
  | 'noumena_managed'
  | 'byok'
  | 'third_party_provider'

export type LeaseRenewalOwner =
  | 'none'
  | 'local_runtime'
  | 'remote_control_plane'
  | 'bridge_control_plane'
  | 'session_runtime'
  | 'byoc_control_plane'
  | 'provider_binding_manager'

export type LeaseMetadataValue = boolean | number | string | null

export interface IssuedRuntimeLease {
  leaseKind: LeaseKind
  leaseId: string
  sessionId: string | null

  state: LeaseState
  renewable: boolean
  renewalOwner: LeaseRenewalOwner

  issuedAt: number
  expiresAt: number | null
  renewAfter: number | null
  graceUntil: number | null

  organizationUuid: string | null
  capabilities: string[]

  executionTarget: LeaseExecutionTarget
  providerMode: LeaseProviderMode

  degradationMode: DegradationMode
  recoveryMessage: string | null

  metadata: Record<string, LeaseMetadataValue>
}

export interface ResolveLeaseOptions {
  nowMs?: number
}

export type ContinuityState =
  | 'healthy'
  | 'renewing'
  | 'degraded'
  | 'reauth_required'
  | 'unavailable'

export type LeaseRenewalState =
  | 'healthy'
  | 'renewal_due'
  | 'grace_period'
  | 'degraded'
  | 'reauth_required'
  | 'not_applicable'

export interface ContinuityStatusView {
  principalKind: ResolvedAuthSession['principalKind']
  principalSource: ResolvedAuthSession['principalSource']
  sessionState: SessionState
  leaseKind: LeaseKind | null
  leaseState: LeaseState | null
  executionTarget: LeaseExecutionTarget | null
  providerMode: LeaseProviderMode | null
  continuityState: ContinuityState
  leaseRenewalState: LeaseRenewalState
  renewable: boolean
  recoveryAction: RecoveryAction
  recoveryMessage: string | null
}

export interface LeaseManager {
  getCachedLease(): IssuedRuntimeLease | null
  resolveLease(options?: ResolveLeaseOptions): Promise<IssuedRuntimeLease | null>
  getStatusView(options?: ResolveLeaseOptions): Promise<ContinuityStatusView>
}

const LOCAL_RENEWAL_WINDOW_MS = 5 * 60 * 1000
const LOCAL_GRACE_WINDOW_MS = 5 * 60 * 1000
const BRIDGE_RENEWAL_WINDOW_MS = 60 * 1000
const BRIDGE_GRACE_WINDOW_MS = 30 * 1000

function computeRenewAfter(
  issuedAt: number,
  expiresAt: number,
  renewalWindowMs: number,
): number {
  return Math.max(issuedAt, expiresAt - renewalWindowMs)
}

function mapProviderMode(
  session: ResolvedAuthSession,
): LeaseProviderMode {
  switch (session.providerPlan.mode) {
    case 'third_party_provider':
      return 'third_party_provider'
    case 'byok_static_env':
      return 'byok'
    case 'noumena_managed':
    case 'none':
      return 'noumena_managed'
  }
}

function mapLocalLeaseState(
  session: ResolvedAuthSession,
): LeaseState {
  switch (session.sessionState) {
    case 'usable':
      return 'usable'
    case 'refreshable':
      return 'renewing'
    case 'reauth_required':
      return 'reauth_required'
    case 'expired':
      return 'expired'
    case 'invalid':
      return 'degraded'
    case 'unauthenticated':
      return 'expired'
  }
}

function mapLocalDegradationMode(
  leaseState: LeaseState,
): DegradationMode {
  switch (leaseState) {
    case 'usable':
    case 'renewing':
    case 'grace_period':
      return 'none'
    case 'degraded':
    case 'expired':
    case 'reauth_required':
    case 'revoked':
      return 'checkpoint_only'
  }
}

export function buildLocalFirstPartyLease(
  session: ResolvedAuthSession,
  options: ResolveLeaseOptions = {},
): IssuedRuntimeLease | null {
  if (
    session.principalKind === 'none' ||
    session.providerAuthKind === 'third_party_provider' ||
    session.providerAuthKind === 'none'
  ) {
    return null
  }

  const issuedAt = options.nowMs ?? Date.now()
  const expiresAt = session.accessTokenExpiresAt
  const renewable = session.canRefresh
  const renewAfter =
    renewable && expiresAt !== null
      ? computeRenewAfter(issuedAt, expiresAt, LOCAL_RENEWAL_WINDOW_MS)
      : null
  const graceUntil =
    renewable && expiresAt !== null ? expiresAt + LOCAL_GRACE_WINDOW_MS : null
  const state = mapLocalLeaseState(session)

  return {
    leaseKind: 'local_first_party',
    leaseId: `local:${session.principalSource}:${session.identity.organizationUuid ?? 'no-org'}:${session.identity.accountUuid ?? 'no-account'}`,
    sessionId: null,
    state,
    renewable,
    renewalOwner: renewable ? 'local_runtime' : 'none',
    issuedAt,
    expiresAt,
    renewAfter,
    graceUntil,
    organizationUuid: session.identity.organizationUuid,
    capabilities:
      session.providerPlan.mode === 'byok_static_env'
        ? ['inference']
        : ['first_party_api', 'inference'],
    executionTarget: 'local',
    providerMode: mapProviderMode(session),
    degradationMode: mapLocalDegradationMode(state),
    recoveryMessage: session.recoveryMessage,
    metadata: {
      principalKind: session.principalKind,
      principalSource: session.principalSource,
      headersKind: session.headersKind,
      hasUsableToken: session.hasUsableToken,
      hasUsableApiKey: session.hasUsableApiKey,
    },
  }
}

export function buildBridgeWorkerLease(
  params: {
    credentials: RemoteCredentials
    nowMs?: number
    organizationUuid?: string | null
    providerMode?: Exclude<LeaseProviderMode, 'third_party_provider'>
    sessionId: string
  },
): IssuedRuntimeLease {
  const issuedAt = params.nowMs ?? Date.now()
  const ttlMs = Math.max(0, params.credentials.expires_in * 1000)
  const expiresAt = issuedAt + ttlMs

  return {
    leaseKind: 'bridge_worker',
    leaseId: `bridge_worker:${params.sessionId}:${params.credentials.worker_epoch}`,
    sessionId: params.sessionId,
    state: ttlMs > 0 ? 'usable' : 'expired',
    renewable: true,
    renewalOwner: 'bridge_control_plane',
    issuedAt,
    expiresAt,
    renewAfter: computeRenewAfter(issuedAt, expiresAt, BRIDGE_RENEWAL_WINDOW_MS),
    graceUntil: expiresAt + BRIDGE_GRACE_WINDOW_MS,
    organizationUuid: params.organizationUuid ?? null,
    capabilities: ['bridge_worker', 'remote_control'],
    executionTarget: 'remote',
    providerMode: params.providerMode ?? 'noumena_managed',
    degradationMode: 'resume_required',
    recoveryMessage:
      'Bridge worker lease expired. Reconnect or resume the remote session to continue.',
    metadata: {
      apiBaseUrl: params.credentials.api_base_url,
      workerEpoch: params.credentials.worker_epoch,
      tokenTransport: 'jwt',
      ttlSeconds: params.credentials.expires_in,
    },
  }
}

export function buildRemoteSessionLease(
  params: {
    nowMs?: number
    organizationUuid?: string | null
    providerMode?: Exclude<LeaseProviderMode, 'third_party_provider'>
    session: ResolvedAuthSession
    sessionId?: string | null
  },
): IssuedRuntimeLease {
  const issuedAt = params.nowMs ?? Date.now()
  const sessionId = params.sessionId ?? null
  const providerMode = params.providerMode ?? 'noumena_managed'

  return {
    leaseKind: 'remote_session',
    leaseId: `remote_session:${sessionId ?? 'pending'}:${params.organizationUuid ?? params.session.identity.organizationUuid ?? 'no-org'}`,
    sessionId,
    state: 'usable',
    renewable: false,
    renewalOwner: 'none',
    issuedAt,
    expiresAt: params.session.accessTokenExpiresAt,
    renewAfter: null,
    graceUntil: null,
    organizationUuid:
      params.organizationUuid ?? params.session.identity.organizationUuid,
    capabilities: ['remote_session', 'inference'],
    executionTarget: 'remote',
    providerMode,
    degradationMode: 'resume_required',
    recoveryMessage:
      'Remote runtime lease expired. Resume or recreate the remote session to continue.',
    metadata: {
      principalKind: params.session.principalKind,
      principalSource: params.session.principalSource,
      tokenTransport:
        providerMode === 'byok' ? 'static_api_key_env' : 'oauth_env',
      accessTokenEnvVarName:
        providerMode === 'byok' ? null : 'NCODE_OAUTH_TOKEN',
      apiKeyEnvVarName:
        providerMode === 'byok'
          ? (params.session.rawApiKeySource ?? 'ANTHROPIC_API_KEY')
          : null,
    },
  }
}

export function buildSessionIngressLease(
  params: {
    executionTarget?: Exclude<LeaseExecutionTarget, 'local'>
    nowMs?: number
    organizationUuid?: string | null
    providerMode?: Exclude<LeaseProviderMode, 'third_party_provider'>
    sessionId?: string | null
    token: string
  },
): IssuedRuntimeLease {
  const issuedAt = params.nowMs ?? Date.now()
  const tokenTransport = params.token.startsWith('sk-ant-sid')
    ? 'cookie'
    : 'bearer'
  const sessionId = params.sessionId ?? null

  return {
    leaseKind: 'session_ingress',
    leaseId: `session_ingress:${sessionId ?? 'detached'}:${tokenTransport}`,
    sessionId,
    state: 'usable',
    renewable: true,
    renewalOwner: 'session_runtime',
    issuedAt,
    expiresAt: null,
    renewAfter: null,
    graceUntil: null,
    organizationUuid: params.organizationUuid ?? null,
    capabilities: ['session_ingress'],
    executionTarget: params.executionTarget ?? 'remote',
    providerMode: params.providerMode ?? 'noumena_managed',
    degradationMode: 'resume_required',
    recoveryMessage:
      'Session ingress credential is unavailable. Reconnect or resume the session to continue.',
    metadata: {
      tokenTransport,
    },
  }
}

export function needsLeaseRenewal(
  lease: IssuedRuntimeLease,
  nowMs: number = Date.now(),
): boolean {
  if (!lease.renewable) {
    return false
  }
  if (
    lease.state === 'expired' ||
    lease.state === 'revoked' ||
    lease.state === 'reauth_required'
  ) {
    return false
  }
  if (lease.renewAfter === null) {
    return false
  }
  return nowMs >= lease.renewAfter
}
