import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'
import { getPlanModeV2AgentCount } from './planModeV2.js'

function makeSession(
  overrides: Partial<ResolvedAuthSession> = {},
): ResolvedAuthSession {
  return {
    principalKind: 'noumena_account',
    principalSource: 'managed_oauth',
    sessionState: 'usable',
    headersKind: 'bearer',
    providerAuthKind: 'noumena_first_party',
    providerPlan: {
      mode: 'noumena_managed',
      source: 'managed_principal',
      staticKeyEnvVarName: null,
    },
    isInteractive: true,
    canRefresh: true,
    canReauthenticateInteractively: true,
    identity: {
      email: 'user@example.com',
      accountUuid: 'acct-123',
      organizationUuid: 'org-123',
      organizationName: 'Test Org',
    },
    subscription: {
      subscriptionName: 'Noumena Max',
      subscriptionType: 'max',
      rateLimitTier: 'default_claude_max_20x',
    },
    scopes: ['user:profile', 'user:inference'],
    hasUsableToken: true,
    hasUsableApiKey: false,
    accessToken: 'oauth-token',
    accessTokenExpiresAt: Date.now() + 10 * 60 * 1_000,
    refreshTokenPresent: true,
    apiKey: null,
    rawAuthTokenSource: 'noumena.com',
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

beforeEach(() => {
  delete process.env.CLAUDE_CODE_PLAN_V2_AGENT_COUNT
})

afterEach(() => {
  delete process.env.CLAUDE_CODE_PLAN_V2_AGENT_COUNT
})

describe('getPlanModeV2AgentCount', () => {
  it('uses canonical managed subscription and tier truth for max 20x sessions', () => {
    expect(
      withMockCurrentSession(makeSession(), () => getPlanModeV2AgentCount()),
    ).toBe(3)
  })

  it('uses canonical managed subscription truth for enterprise sessions', () => {
    expect(
      withMockCurrentSession(
        makeSession({
          subscription: {
            subscriptionName: 'Noumena Enterprise',
            subscriptionType: 'enterprise',
            rateLimitTier: 'tier-1',
          },
        }),
        () => getPlanModeV2AgentCount(),
      ),
    ).toBe(3)
  })

  it('does not treat direct api-key sessions as managed plan-mode subscribers', () => {
    expect(
      withMockCurrentSession(
        makeSession({
          principalKind: 'api_key_user',
          principalSource: 'direct_api_key_env',
          headersKind: 'api_key',
          providerAuthKind: 'noumena_first_party',
          providerPlan: {
            mode: 'noumena_managed',
            source: 'direct_api_key_env',
            staticKeyEnvVarName: 'NOUMENA_API_KEY',
          },
          subscription: {
            subscriptionName: null,
            subscriptionType: null,
            rateLimitTier: null,
          },
          scopes: [],
          hasUsableToken: false,
          hasUsableApiKey: true,
          accessToken: null,
          accessTokenExpiresAt: null,
          refreshTokenPresent: false,
          apiKey: 'api-key',
          rawAuthTokenSource: null,
          rawApiKeySource: 'NOUMENA_API_KEY',
        }),
        () => getPlanModeV2AgentCount(),
      ),
    ).toBe(1)
  })

  it('preserves the explicit env override', () => {
    process.env.CLAUDE_CODE_PLAN_V2_AGENT_COUNT = '5'

    expect(
      withMockCurrentSession(
        makeSession({
          subscription: {
            subscriptionName: null,
            subscriptionType: null,
            rateLimitTier: null,
          },
        }),
        () => getPlanModeV2AgentCount(),
      ),
    ).toBe(5)
  })
})
