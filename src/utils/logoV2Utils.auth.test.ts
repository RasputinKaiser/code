import { afterEach, describe, expect, it } from 'bun:test'
import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'
import { getLogoDisplayData } from './logoV2Utils.js'

declare global {
  // eslint-disable-next-line no-var
  var MACRO: { VERSION: string }
}

const originalMacro = globalThis.MACRO

function makeSession(
  overrides: Partial<ResolvedAuthSession>,
): ResolvedAuthSession {
  return {
    principalKind: 'none',
    principalSource: 'none',
    sessionState: 'unauthenticated',
    headersKind: 'none',
    providerAuthKind: 'none',
    providerPlan: {
      mode: 'none',
      source: 'none',
      staticKeyEnvVarName: null,
    },
    isInteractive: true,
    canRefresh: false,
    canReauthenticateInteractively: false,
    identity: {
      email: null,
      accountUuid: null,
      organizationUuid: null,
      organizationName: null,
    },
    subscription: {
      subscriptionName: null,
      subscriptionType: null,
      rateLimitTier: null,
    },
    scopes: [],
    hasUsableToken: false,
    hasUsableApiKey: false,
    accessToken: null,
    accessTokenExpiresAt: null,
    refreshTokenPresent: false,
    apiKey: null,
    rawAuthTokenSource: null,
    rawApiKeySource: null,
    recoveryAction: 'none',
    recoveryMessage: null,
    sourceDetails: {
      usedLegacyCompat: false,
      usedEnvVar: false,
      usedFileDescriptor: false,
      usedHelper: false,
    },
    ...overrides,
  }
}

function withMockCurrentSession<T>(session: ResolvedAuthSession, fn: () => T): T {
  const runtime = getAuthRuntime()
  const originalGetCurrentSession = runtime.getCurrentSession.bind(runtime)
  ;(
    runtime as {
      getCurrentSession: typeof runtime.getCurrentSession
    }
  ).getCurrentSession = () => session

  try {
    return fn()
  } finally {
    ;(
      runtime as {
        getCurrentSession: typeof runtime.getCurrentSession
      }
    ).getCurrentSession = originalGetCurrentSession
  }
}

afterEach(() => {
  globalThis.MACRO = originalMacro
})

describe('logoV2Utils auth gating', () => {
  it('shows Noumena Managed billing for oauth-backed first-party sessions without a concrete tier', () => {
    globalThis.MACRO = { VERSION: 'test-version' }

    const session = makeSession({
      headersKind: 'bearer',
      providerPlan: {
        mode: 'noumena_managed',
        source: 'service_credential',
        staticKeyEnvVarName: null,
      },
      scopes: ['user:inference'],
    })

    const result = withMockCurrentSession(session, () => getLogoDisplayData())

    expect(result.billingType).toBe('Noumena Managed')
  })

  it('keeps API Usage Billing for direct API-key sessions', () => {
    globalThis.MACRO = { VERSION: 'test-version' }

    const session = makeSession({
      principalKind: 'api_key_user',
      principalSource: 'direct_api_key_env',
      sessionState: 'usable',
      headersKind: 'api_key',
      providerAuthKind: 'byok_static_env',
      providerPlan: {
        mode: 'byok_static_env',
        source: 'direct_api_key_env',
        staticKeyEnvVarName: 'ANTHROPIC_API_KEY',
      },
      hasUsableApiKey: true,
      apiKey: 'byok-key',
      rawApiKeySource: 'ANTHROPIC_API_KEY',
    })

    const result = withMockCurrentSession(session, () => getLogoDisplayData())

    expect(result.billingType).toBe('API Usage Billing')
  })
})
