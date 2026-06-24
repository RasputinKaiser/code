import type { Attributes } from '@opentelemetry/api'
import { getSessionId } from 'src/bootstrap/state.js'
import { isInternalBuild } from 'src/capabilities/static.js'
import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'
import { getOrCreateUserID } from './config.js'
import { envDynamic } from './envDynamic.js'
import { isEnvTruthy } from './envUtils.js'
import { buildTelemetrySessionState } from './telemetry/sessionTelemetry.js'
import { toTaggedId } from './taggedId.js'

// Default configuration for metrics cardinality. Public builds default to
// privacy-preserving values; internal builds may retain richer defaults.
const METRICS_CARDINALITY_DEFAULTS = isInternalBuild()
  ? {
      OTEL_METRICS_INCLUDE_SESSION_ID: true,
      OTEL_METRICS_INCLUDE_VERSION: false,
      OTEL_METRICS_INCLUDE_ACCOUNT_UUID: true,
    }
  : {
      OTEL_METRICS_INCLUDE_SESSION_ID: false,
      OTEL_METRICS_INCLUDE_VERSION: false,
      OTEL_METRICS_INCLUDE_ACCOUNT_UUID: false,
    }

function shouldIncludeAttribute(
  envVar: keyof typeof METRICS_CARDINALITY_DEFAULTS,
): boolean {
  const defaultValue = METRICS_CARDINALITY_DEFAULTS[envVar]
  const envValue = process.env[envVar]

  if (envValue === undefined) {
    return defaultValue
  }

  return isEnvTruthy(envValue)
}

type TelemetryIdentitySession =
  | Pick<ResolvedAuthSession, 'providerPlan' | 'headersKind' | 'scopes' | 'identity'>
  | null
  | undefined

export function buildTelemetryIdentityAttributes(
  session: TelemetryIdentitySession,
): Attributes {
  const telemetrySession =
    session == null
      ? {
          isOauthBackedFirstPartySession: false,
          subscriptionType: null,
          isEnterpriseOrTeam: false,
        }
      : buildTelemetrySessionState(session)

  if (!telemetrySession.isOauthBackedFirstPartySession) {
    return {}
  }

  const attributes: Attributes = {}
  const orgId = session?.identity.organizationUuid ?? null
  const email = session?.identity.email ?? null
  const accountUuid = session?.identity.accountUuid ?? null

  if (orgId) attributes['organization.id'] = orgId
  if (email) attributes['user.email'] = email

  if (
    accountUuid &&
    shouldIncludeAttribute('OTEL_METRICS_INCLUDE_ACCOUNT_UUID')
  ) {
    attributes['user.account_uuid'] = accountUuid
    attributes['user.account_id'] =
      process.env.CLAUDE_CODE_ACCOUNT_TAGGED_ID ||
      toTaggedId('user', accountUuid)
  }

  return attributes
}

export function getTelemetryAttributes(): Attributes {
  const userId = getOrCreateUserID()
  const sessionId = getSessionId()

  const attributes: Attributes = {
    'user.id': userId,
  }

  if (shouldIncludeAttribute('OTEL_METRICS_INCLUDE_SESSION_ID')) {
    attributes['session.id'] = sessionId
  }
  if (shouldIncludeAttribute('OTEL_METRICS_INCLUDE_VERSION')) {
    attributes['app.version'] = MACRO.VERSION
  }

  Object.assign(
    attributes,
    buildTelemetryIdentityAttributes(getAuthRuntime().getCurrentSession()),
  )

  // Add terminal type if available
  if (envDynamic.terminal) {
    attributes['terminal.type'] = envDynamic.terminal
  }

  return attributes
}
