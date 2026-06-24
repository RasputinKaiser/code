import type { RecoveryAction } from './types.js'

export type AuthFailureCode =
  | 'unauthenticated'
  | 'managed_oauth_expired'
  | 'managed_oauth_reauth_required'
  | 'api_key_missing'
  | 'service_credential_invalid'
  | 'unsupported_auth_mode'

export class AuthRuntimeError extends Error {
  readonly code: AuthFailureCode
  readonly recoveryAction: RecoveryAction
  readonly userMessage: string
  readonly retryable: boolean

  constructor(params: {
    code: AuthFailureCode
    message: string
    userMessage: string
    recoveryAction: RecoveryAction
    retryable?: boolean
  }) {
    super(params.message)
    this.name = 'AuthRuntimeError'
    this.code = params.code
    this.recoveryAction = params.recoveryAction
    this.userMessage = params.userMessage
    this.retryable = params.retryable ?? false
  }
}
