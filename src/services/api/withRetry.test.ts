import type Anthropic from '@anthropic-ai/sdk'
import { APIError } from '@anthropic-ai/sdk'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { getAuthRuntime } from 'src/auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from 'src/auth/runtime/types.js'
import { resetStateForTests } from 'src/bootstrap/state.js'
import { clearOAuthTokenCache } from 'src/utils/auth.js'
import {
  _setGlobalConfigCacheForTesting,
  enableConfigs,
} from 'src/utils/config.js'
import { getSecureStorage } from 'src/utils/secureStorage/index.js'
import type { ThinkingConfig } from '../../utils/thinking.js'
import {
  CannotRetryError,
  getRetryDelay,
  is529Error,
  parseMaxTokensContextOverflowError,
  withRetry,
} from './withRetry.js'
import {
  OpenAICompatBackendAbortError,
  OpenAICompatHTTPError,
  OpenAICompatTransportError,
} from './openAICompatInferenceClient.js'

let tempConfigDir = ''
const originalMacro = (globalThis as { MACRO?: unknown }).MACRO

const envKeys = [
  'NODE_ENV',
  'NCODE_CONFIG_DIR',
  'CLAUDE_CONFIG_DIR',
  'CLAUDE_CODE_MAX_RETRIES',
  'CLAUDE_CODE_UNATTENDED_RETRY',
  'CLAUDE_CODE_DISABLE_FAST_MODE',
  'CLAUDE_CODE_REMOTE',
  'FALLBACK_FOR_ALL_PRIMARY_MODELS',
  'USER_TYPE',
  'CI',
  'NOUMENA_API_KEY',
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
] as const

const originalEnv = Object.fromEntries(
  envKeys.map(key => [key, process.env[key]]),
) as Record<(typeof envKeys)[number], string | undefined>

function restoreEnvVar(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

function restoreEnv(): void {
  for (const key of envKeys) {
    restoreEnvVar(key, originalEnv[key])
  }
}

function setStableTestRuntime(): void {
  process.env.NODE_ENV = 'test'
  process.env.NCODE_CONFIG_DIR = tempConfigDir
  process.env.CLAUDE_CONFIG_DIR = tempConfigDir
  delete process.env.CLAUDE_CODE_MAX_RETRIES
  delete process.env.CLAUDE_CODE_UNATTENDED_RETRY
  delete process.env.CLAUDE_CODE_DISABLE_FAST_MODE
  delete process.env.CLAUDE_CODE_REMOTE
  delete process.env.FALLBACK_FOR_ALL_PRIMARY_MODELS
  delete process.env.USER_TYPE
  delete process.env.CI
  delete process.env.NOUMENA_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN

  ;(globalThis as { MACRO?: Record<string, unknown> }).MACRO = {
    ...(typeof originalMacro === 'object' && originalMacro !== null
      ? (originalMacro as Record<string, unknown>)
      : {}),
    VERSION: 'test-version',
  }
}

function makeApiError(
  status: number,
  message: string,
  headers?: Headers,
): APIError {
  return new APIError(status, { message }, undefined, headers)
}

function makeOauthBackedRetrySession(): ResolvedAuthSession {
  return {
    principalKind: 'service_principal',
    principalSource: 'service_oauth_env',
    sessionState: 'usable',
    headersKind: 'bearer',
    providerAuthKind: 'noumena_first_party',
    providerPlan: {
      mode: 'noumena_managed',
      source: 'service_credential',
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
    scopes: ['user:inference'],
    hasUsableToken: true,
    hasUsableApiKey: false,
    accessToken: 'oauth-backed-token',
    accessTokenExpiresAt: Date.now() + 10 * 60 * 1_000,
    refreshTokenPresent: false,
    apiKey: null,
    rawAuthTokenSource: 'CLAUDE_CODE_OAUTH_TOKEN',
    rawApiKeySource: null,
    recoveryAction: 'none',
    recoveryMessage: null,
    sourceDetails: {
      usedLegacyCompat: false,
      usedEnvVar: true,
      usedFileDescriptor: false,
      usedHelper: false,
    },
  }
}

function makeApiKeyRetrySession(): ResolvedAuthSession {
  return {
    principalKind: 'api_key_user',
    principalSource: 'direct_api_key_env',
    sessionState: 'usable',
    headersKind: 'api_key',
    providerAuthKind: 'noumena_first_party',
    providerPlan: {
      mode: 'noumena_managed',
      source: 'direct_api_key_env',
      staticKeyEnvVarName: 'NOUMENA_API_KEY',
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
    hasUsableApiKey: true,
    accessToken: null,
    accessTokenExpiresAt: null,
    refreshTokenPresent: false,
    apiKey: 'test-api-key',
    rawAuthTokenSource: null,
    rawApiKeySource: 'NOUMENA_API_KEY',
    recoveryAction: 'none',
    recoveryMessage: null,
    sourceDetails: {
      usedLegacyCompat: false,
      usedEnvVar: true,
      usedFileDescriptor: false,
      usedHelper: false,
    },
  }
}

async function withMockCurrentSession<T>(
  session: ResolvedAuthSession,
  fn: () => Promise<T> | T,
): Promise<T> {
  const runtime = getAuthRuntime()
  const originalGetCurrentSession = runtime.getCurrentSession.bind(runtime)
  ;(
    runtime as {
      getCurrentSession: typeof runtime.getCurrentSession
    }
  ).getCurrentSession = () => session

  try {
    return await fn()
  } finally {
    ;(
      runtime as {
        getCurrentSession: typeof runtime.getCurrentSession
      }
    ).getCurrentSession = originalGetCurrentSession
  }
}

beforeAll(async () => {
  tempConfigDir = await mkdtemp(join(tmpdir(), 'ncode-with-retry-test-'))
})

beforeEach(() => {
  restoreEnv()
  setStableTestRuntime()
  enableConfigs()
  resetStateForTests()
  clearOAuthTokenCache()
  getSecureStorage().delete()
  _setGlobalConfigCacheForTesting(null)
})

afterEach(() => {
  restoreEnv()
  resetStateForTests()
  clearOAuthTokenCache()
  getSecureStorage().delete()
  _setGlobalConfigCacheForTesting(null)
  ;(globalThis as { MACRO?: unknown }).MACRO = originalMacro
})

afterAll(async () => {
  await rm(tempConfigDir, { recursive: true, force: true })
})

describe('withRetry', () => {
  it('retries context-overflow errors with an adjusted maxTokensOverride', async () => {
    const attempts: Array<{ attempt: number; maxTokensOverride?: number }> = []
    const overflowError = makeApiError(
      400,
      'input length and `max_tokens` exceed context limit: 188059 + 20000 > 200000',
    )

    const iterator = withRetry(
      async () => ({}) as Anthropic,
      async (_client, attempt, context) => {
        attempts.push({
          attempt,
          maxTokensOverride: context.maxTokensOverride,
        })
        if (attempt === 1) {
          throw overflowError
        }
        return 'ok'
      },
      {
        maxRetries: 1,
        model: 'claude-3-7-sonnet-20250219',
        thinkingConfig: { type: 'disabled' } satisfies ThinkingConfig,
      },
    )

    const result = await iterator.next()

    expect(result).toEqual({ done: true, value: 'ok' })
    expect(attempts).toEqual([
      { attempt: 1, maxTokensOverride: undefined },
      { attempt: 2, maxTokensOverride: 10941 },
    ])
  })

  it('drops 529 retries immediately for non-foreground query sources', async () => {
    const overloadedError = makeApiError(529, 'gateway overloaded')

    const iterator = withRetry(
      async () => ({}) as Anthropic,
      async () => {
        throw overloadedError
      },
      {
        maxRetries: 3,
        model: 'claude-3-7-sonnet-20250219',
        thinkingConfig: { type: 'disabled' } satisfies ThinkingConfig,
        querySource: 'insights' as never,
      },
    )

    let caught: unknown
    try {
      await iterator.next()
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(CannotRetryError)
    expect((caught as CannotRetryError).originalError).toBe(overloadedError)
  })

  it('getRetryDelay honors retry-after and falls back to deterministic base delay when jitter is zero', () => {
    const originalRandom = Math.random
    Math.random = () => 0
    try {
      expect(getRetryDelay(3, '7')).toBe(7000)
      expect(getRetryDelay(3, null)).toBe(2000)
    } finally {
      Math.random = originalRandom
    }
  })

  it('parseMaxTokensContextOverflowError parses the legacy overflow message and rejects non-matching errors', () => {
    expect(
      parseMaxTokensContextOverflowError(
        makeApiError(
          400,
          'input length and `max_tokens` exceed context limit: 100 + 250 > 1000',
        ),
      ),
    ).toEqual({
      inputTokens: 100,
      maxTokens: 250,
      contextLimit: 1000,
    })

    expect(
      parseMaxTokensContextOverflowError(
        makeApiError(400, 'some other bad request'),
      ),
    ).toBeUndefined()
  })

  it('is529Error recognizes both real 529s and streaming overloaded-error messages', () => {
    expect(is529Error(makeApiError(529, 'overloaded'))).toBe(true)
    expect(
      is529Error(makeApiError(500, '{"type":"overloaded_error"}')),
    ).toBe(true)
    expect(is529Error(makeApiError(500, 'ordinary server error'))).toBe(false)
  })

  it('does not retry immediate 429s for canonical oauth-backed first-party sessions', async () => {
    const rateLimitError = makeApiError(
      429,
      'rate limited',
      new Headers({
        'x-should-retry': 'true',
        'retry-after': '0',
      }),
    )

    let attempts = 0
    const iterator = withRetry(
      async () => ({}) as Anthropic,
      async () => {
        attempts++
        throw rateLimitError
      },
      {
        maxRetries: 2,
        model: 'claude-3-7-sonnet-20250219',
        thinkingConfig: { type: 'disabled' } satisfies ThinkingConfig,
      },
    )

    let caught: unknown
    await withMockCurrentSession(makeOauthBackedRetrySession(), async () => {
      try {
        await iterator.next()
      } catch (error) {
        caught = error
      }
    })

    expect(caught).toBeInstanceOf(CannotRetryError)
    expect((caught as CannotRetryError).originalError).toBe(rateLimitError)
    expect(attempts).toBe(1)
  })

  it('retries immediate 429s for canonical API-key sessions', async () => {
    const rateLimitError = makeApiError(
      429,
      'rate limited',
      new Headers({
        'x-should-retry': 'true',
        'retry-after': '0',
      }),
    )

    let attempts = 0
    const iterator = withRetry(
      async () => ({}) as Anthropic,
      async () => {
        attempts++
        if (attempts === 1) {
          throw rateLimitError
        }
        return 'ok'
      },
      {
        maxRetries: 1,
        model: 'claude-3-7-sonnet-20250219',
        thinkingConfig: { type: 'disabled' } satisfies ThinkingConfig,
      },
    )

    const { retryNotice, result } = await withMockCurrentSession(
      makeApiKeyRetrySession(),
      async () => {
        const retryNotice = await iterator.next()
        const result = await iterator.next()
        return { retryNotice, result }
      },
    )

    expect(retryNotice.done).toBe(false)
    expect(retryNotice.value.type).toBe('system')
    expect(retryNotice.value.subtype).toBe('api_error')
    expect(result).toEqual({ done: true, value: 'ok' })
    expect(attempts).toBe(2)
  })

  it('retries OpenAI-compatible backend aborts', async () => {
    let attempts = 0
    const iterator = withRetry(
      async () => ({}) as Anthropic,
      async () => {
        attempts++
        if (attempts === 1) {
          throw new OpenAICompatBackendAbortError('stream')
        }
        return 'ok'
      },
      {
        maxRetries: 1,
        model: '/data/models/hf/deepseek-ai__DeepSeek-V4-Pro',
        thinkingConfig: { type: 'adaptive' } satisfies ThinkingConfig,
      },
    )

    const result = await iterator.next()

    expect(result).toEqual({ done: true, value: 'ok' })
    expect(attempts).toBe(2)
  })

  it('retries OpenAI-compatible 5xx responses', async () => {
    let attempts = 0
    const iterator = withRetry(
      async () => ({}) as Anthropic,
      async () => {
        attempts++
        if (attempts === 1) {
          throw new OpenAICompatHTTPError(500, 'Internal Server Error')
        }
        return 'ok'
      },
      {
        maxRetries: 1,
        model: '/data/models/hf/deepseek-ai__DeepSeek-V4-Pro',
        thinkingConfig: { type: 'adaptive' } satisfies ThinkingConfig,
      },
    )

    const result = await iterator.next()

    expect(result).toEqual({ done: true, value: 'ok' })
    expect(attempts).toBe(2)
  })

  it('retries OpenAI-compatible transport failures', async () => {
    let attempts = 0
    const iterator = withRetry(
      async () => ({}) as Anthropic,
      async () => {
        attempts++
        if (attempts === 1) {
          throw new OpenAICompatTransportError(
            'fetch failed',
            Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
          )
        }
        return 'ok'
      },
      {
        maxRetries: 1,
        model: '/data/models/hf/deepseek-ai__DeepSeek-V4-Pro',
        thinkingConfig: { type: 'adaptive' } satisfies ThinkingConfig,
      },
    )

    const result = await iterator.next()

    expect(result).toEqual({ done: true, value: 'ok' })
    expect(attempts).toBe(2)
  })
})
