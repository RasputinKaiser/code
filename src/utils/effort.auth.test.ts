import { afterEach, describe, expect, it } from 'bun:test'
import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'
import {
  getDefaultEffortForModel,
  modelSupportsEffort,
  modelSupportsMaxEffort,
  resolveAppliedEffort,
} from './effort.js'
import { KIMI_2_7_CODER_MODEL } from './model/ncodeModels.js'

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

function withMockCurrentSession<T>(
  session: ResolvedAuthSession,
  fn: () => T,
): T {
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

const originalBuildMode = process.env.NCODE_BUILD_MODE
const originalUserType = process.env.USER_TYPE

afterEach(() => {
  if (originalBuildMode === undefined) {
    delete process.env.NCODE_BUILD_MODE
  } else {
    process.env.NCODE_BUILD_MODE = originalBuildMode
  }

  if (originalUserType === undefined) {
    delete process.env.USER_TYPE
  } else {
    process.env.USER_TYPE = originalUserType
  }
})

describe('effort auth gating', () => {
  it('exposes NCode managed model effort capabilities', () => {
    process.env.NCODE_BUILD_MODE = 'noumena'
    delete process.env.USER_TYPE

    expect(modelSupportsEffort(KIMI_2_7_CODER_MODEL)).toBe(true)
    expect(modelSupportsMaxEffort(KIMI_2_7_CODER_MODEL)).toBe(false)
    expect(getDefaultEffortForModel(KIMI_2_7_CODER_MODEL)).toBe('high')
    expect(resolveAppliedEffort(KIMI_2_7_CODER_MODEL, 'max')).toBe('high')
  })

  it('defaults opus 4.6 to medium for pro oauth-backed sessions', () => {
    delete process.env.NCODE_BUILD_MODE
    delete process.env.USER_TYPE

    const session = makeSession({
      headersKind: 'bearer',
      providerPlan: {
        mode: 'noumena_managed',
        source: 'managed_principal',
        staticKeyEnvVarName: null,
      },
      scopes: ['user:inference', 'user:profile'],
      subscription: {
        subscriptionName: 'Noumena Pro',
        subscriptionType: 'pro',
        rateLimitTier: 'tier-1',
      },
    })

    const effort = withMockCurrentSession(session, () =>
      getDefaultEffortForModel('opus-4-6-20260101'),
    )

    expect(effort).toBe('medium')
  })

  it('defaults opus 4.6 to medium for team oauth-backed sessions when enabled', () => {
    delete process.env.NCODE_BUILD_MODE
    delete process.env.USER_TYPE

    const session = makeSession({
      headersKind: 'bearer',
      providerPlan: {
        mode: 'noumena_managed',
        source: 'managed_principal',
        staticKeyEnvVarName: null,
      },
      scopes: ['user:inference', 'user:profile'],
      subscription: {
        subscriptionName: 'Noumena Team',
        subscriptionType: 'team',
        rateLimitTier: 'tier-1',
      },
    })

    const effort = withMockCurrentSession(session, () =>
      getDefaultEffortForModel('opus-4-6-20260101'),
    )

    expect(effort).toBe('medium')
  })

  it('keeps direct api-key sessions on the non-subscriber default', () => {
    delete process.env.NCODE_BUILD_MODE
    delete process.env.USER_TYPE

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

    const effort = withMockCurrentSession(session, () =>
      getDefaultEffortForModel('opus-4-6-20260101'),
    )

    expect(effort).toBeUndefined()
  })
})
