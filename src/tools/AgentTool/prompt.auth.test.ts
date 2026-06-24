import { afterEach, describe, expect, it } from 'bun:test'
import { getAuthRuntime } from '../../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'
import { getPrompt } from './prompt.js'

const originalAgentListSetting = process.env.CLAUDE_CODE_AGENT_LIST_IN_MESSAGES

function restoreEnv(): void {
  if (originalAgentListSetting === undefined) {
    delete process.env.CLAUDE_CODE_AGENT_LIST_IN_MESSAGES
  } else {
    process.env.CLAUDE_CODE_AGENT_LIST_IN_MESSAGES = originalAgentListSetting
  }
}

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
  fn: () => Promise<T> | T,
): Promise<T> | T {
  const runtime = getAuthRuntime()
  const originalGetCurrentSession = runtime.getCurrentSession.bind(runtime)
  ;(
    runtime as {
      getCurrentSession: typeof runtime.getCurrentSession
    }
  ).getCurrentSession = () => session

  const restore = () => {
    ;(
      runtime as {
        getCurrentSession: typeof runtime.getCurrentSession
      }
    ).getCurrentSession = originalGetCurrentSession
  }

  try {
    const result = fn()
    if (result instanceof Promise) {
      return result.finally(restore)
    }
    restore()
    return result
  } catch (error) {
    restore()
    throw error
  }
}

afterEach(() => {
  restoreEnv()
})

describe('AgentTool prompt auth gating', () => {
  it('omits the concurrency note for pro oauth-backed sessions', async () => {
    process.env.CLAUDE_CODE_AGENT_LIST_IN_MESSAGES = 'false'
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

    const prompt = await withMockCurrentSession(session, () =>
      getPrompt([], false),
    )

    expect(prompt).not.toContain(
      'Launch multiple agents concurrently whenever possible',
    )
  })

  it('keeps the concurrency note for non-pro api-key sessions', async () => {
    process.env.CLAUDE_CODE_AGENT_LIST_IN_MESSAGES = 'false'
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

    const prompt = await withMockCurrentSession(session, () =>
      getPrompt([], false),
    )

    expect(prompt).toContain(
      'Launch multiple agents concurrently whenever possible',
    )
  })
})
