import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'
import { getOauthProfileFromOauthToken } from '../services/oauth/getOauthProfile.js'
import type { OrgValidationResult } from './auth.js'
import { getSettingsForSource } from './settings/settings.js'

const FORCE_LOGIN_ORG_ENV_TOKEN_SOURCES = new Set([
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_SESSION_ACCESS_TOKEN',
  'NCODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
  'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
])

export function hasForceLoginOrgValidatableSession(
  session: ResolvedAuthSession,
): boolean {
  if (!session.accessToken) {
    return false
  }

  return (
    session.principalSource === 'managed_oauth' ||
    session.principalSource === 'service_oauth_env' ||
    session.principalSource === 'service_oauth_fd'
  )
}

export function getForceLoginOrgProfileFetchFailureMessage(
  requiredOrgUuid: string,
): string {
  return (
    `Unable to verify organization for the current authentication token.\n` +
    `This machine requires organization ${requiredOrgUuid} but the profile could not be fetched.\n` +
    `This may be a network error, or the token may lack the user:profile scope required for\n` +
    `verification (tokens from 'code setup-token' do not include this scope).\n` +
    `Try again, or obtain a full-scope token via 'code auth login'.`
  )
}

export function getForceLoginOrgMismatchMessage(params: {
  requiredOrgUuid: string
  tokenOrgUuid: string
  rawAuthTokenSource: null | string
}): string {
  const { requiredOrgUuid, tokenOrgUuid, rawAuthTokenSource } = params

  if (
    rawAuthTokenSource &&
    FORCE_LOGIN_ORG_ENV_TOKEN_SOURCES.has(rawAuthTokenSource)
  ) {
    return (
      `The ${rawAuthTokenSource} environment variable provides a token for a\n` +
      `different organization than required by this machine's managed settings.\n\n` +
      `Required organization: ${requiredOrgUuid}\n` +
      `Token organization:   ${tokenOrgUuid}\n\n` +
      `Remove the environment variable or obtain a token for the correct organization.`
    )
  }

  return (
    `Your authentication token belongs to organization ${tokenOrgUuid},\n` +
    `but this machine requires organization ${requiredOrgUuid}.\n\n` +
    `Please log in with the correct organization: code auth login`
  )
}

export async function validateForceLoginOrgForCurrentSession(): Promise<OrgValidationResult> {
  if (process.env.ANTHROPIC_UNIX_SOCKET) {
    return { valid: true }
  }

  const requiredOrgUuid =
    getSettingsForSource('policySettings')?.forceLoginOrgUUID
  if (!requiredOrgUuid) {
    return { valid: true }
  }

  const session = await getAuthRuntime().resolveSession({ allowRefresh: true })
  if (!hasForceLoginOrgValidatableSession(session)) {
    return { valid: true }
  }

  const profile = await getOauthProfileFromOauthToken(session.accessToken)
  if (!profile) {
    return {
      valid: false,
      message: getForceLoginOrgProfileFetchFailureMessage(requiredOrgUuid),
    }
  }

  const tokenOrgUuid = profile.organization.uuid
  if (tokenOrgUuid === requiredOrgUuid) {
    return { valid: true }
  }

  return {
    valid: false,
    message: getForceLoginOrgMismatchMessage({
      requiredOrgUuid,
      tokenOrgUuid,
      rawAuthTokenSource: session.rawAuthTokenSource,
    }),
  }
}
