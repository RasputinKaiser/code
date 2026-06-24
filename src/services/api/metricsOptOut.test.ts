import axios from 'axios'
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
import { getAuthRuntime } from '../../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../../auth/runtime/types.js'
import { resetStateForTests } from '../../bootstrap/state.js'
import { clearOAuthTokenCache } from '../../utils/auth.js'
import {
  _setGlobalConfigCacheForTesting,
  enableConfigs,
  getGlobalConfig,
  saveGlobalConfig,
} from '../../utils/config.js'
import { getSecureStorage } from '../../utils/secureStorage/index.js'
import {
  _clearMetricsEnabledCacheForTesting,
  checkMetricsEnabled,
  shouldSkipMetricsEnabledFetchForSession,
} from './metricsOptOut.js'

let tempConfigDir = ''
const axiosCalls: Array<{ url: string; options?: unknown }> = []
const originalAxiosGet = axios.get
const originalMacro = (globalThis as { MACRO?: unknown }).MACRO

const envKeys = [
  'NODE_ENV',
  'NCODE_CONFIG_DIR',
  'CLAUDE_CONFIG_DIR',
  'NOUMENA_PLATFORM_BASE_URL',
  'ANTHROPIC_API_KEY',
  'NOUMENA_API_KEY',
  'CLAUDE_CODE_ORGANIZATION_UUID',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'NCODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
  'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
  'CLAUDE_CODE_ENTRYPOINT',
  'USER_TYPE',
  'CI',
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
  process.env.NOUMENA_PLATFORM_BASE_URL = 'https://api.noumena.test'
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.NOUMENA_API_KEY
  delete process.env.CLAUDE_CODE_ORGANIZATION_UUID
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN
  delete process.env.NCODE_OAUTH_TOKEN_FILE_DESCRIPTOR
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR
  delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
  delete process.env.CI
  delete process.env.CLAUDE_CODE_ENTRYPOINT
  delete process.env.USER_TYPE

  ;(globalThis as { MACRO?: Record<string, unknown> }).MACRO = {
    ...(typeof originalMacro === 'object' && originalMacro !== null
      ? (originalMacro as Record<string, unknown>)
      : {}),
    VERSION: 'test-version',
  }
}

function makeDirectApiKeySession(apiKey = 'api-key'): ResolvedAuthSession {
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
    apiKey,
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

function makeServiceOauthSession(scopes: string[]): ResolvedAuthSession {
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
    scopes,
    hasUsableToken: true,
    hasUsableApiKey: false,
    accessToken: 'service-token',
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

async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 1000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Timed out waiting for background refresh')
}

beforeAll(async () => {
  tempConfigDir = await mkdtemp(join(tmpdir(), 'ncode-metrics-opt-out-test-'))
})

beforeEach(() => {
  restoreEnv()
  setStableTestRuntime()
  enableConfigs()
  resetStateForTests()
  clearOAuthTokenCache()
  getSecureStorage().delete()
  _clearMetricsEnabledCacheForTesting()
  _setGlobalConfigCacheForTesting(null)
  saveGlobalConfig(current => ({
    ...current,
    oauthAccount: {
      accountUuid: 'acct-123',
      emailAddress: 'test@example.com',
      organizationUuid: 'org-123',
      organizationName: 'Test Org',
    },
    metricsStatusCache: undefined,
  }))
  axiosCalls.length = 0
  axios.get = (async (url: string, options?: unknown) => {
    axiosCalls.push({ url, options })
    return {
      data: {
        metrics_logging_enabled: true,
      },
    }
  }) as typeof axios.get
})

afterEach(() => {
  axios.get = originalAxiosGet
  resetStateForTests()
  clearOAuthTokenCache()
  getSecureStorage().delete()
  _clearMetricsEnabledCacheForTesting()
  _setGlobalConfigCacheForTesting(null)
  restoreEnv()
  ;(globalThis as { MACRO?: unknown }).MACRO = originalMacro
})

afterAll(async () => {
  await rm(tempConfigDir, { recursive: true, force: true })
})

describe('checkMetricsEnabled', () => {
  it('skips first-party bearer sessions that lack profile scope but does not skip api-key sessions', () => {
    expect(
      shouldSkipMetricsEnabledFetchForSession({
        headersKind: 'bearer',
        providerPlan: {
          mode: 'noumena_managed',
          source: 'service_credential',
          staticKeyEnvVarName: null,
        },
        scopes: ['user:inference'],
      } as const),
    ).toBe(true)

    expect(
      shouldSkipMetricsEnabledFetchForSession({
        headersKind: 'api_key',
        providerPlan: {
          mode: 'byok_static_env',
          source: 'direct_api_key_env',
          staticKeyEnvVarName: 'ANTHROPIC_API_KEY',
        },
        scopes: [],
      } as const),
    ).toBe(false)
  })

  it('blocks on the first API call and persists the disk cache', async () => {
    const result = await withMockCurrentSession(
      makeDirectApiKeySession('api-key'),
      () => checkMetricsEnabled(),
    )

    expect(result).toEqual({ enabled: true, hasError: false })
    expect(axiosCalls).toEqual([
      {
        url: 'https://api.noumena.test/api/claude_code/organizations/metrics_enabled',
        options: {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'ncode/test-version',
            'x-organization-uuid': 'org-123',
            'x-api-key': 'api-key',
          },
          timeout: 5000,
        },
      },
    ])

    const cached = getGlobalConfig().metricsStatusCache
    expect(cached?.enabled).toBe(true)
    expect(typeof cached?.timestamp).toBe('number')
  })

  it('returns the fresh disk cache without hitting the network', async () => {
    saveGlobalConfig(current => ({
      ...current,
      metricsStatusCache: {
        enabled: false,
        timestamp: Date.now(),
      },
    }))

    const result = await withMockCurrentSession(
      makeDirectApiKeySession('api-key'),
      () => checkMetricsEnabled(),
    )

    expect(result).toEqual({ enabled: false, hasError: false })
    expect(axiosCalls).toEqual([])
  })

  it('returns stale disk cache immediately and refreshes it in the background', async () => {
    saveGlobalConfig(current => ({
      ...current,
      metricsStatusCache: {
        enabled: false,
        timestamp: Date.now() - 25 * 60 * 60 * 1000,
      },
    }))

    const result = await withMockCurrentSession(
      makeDirectApiKeySession('api-key'),
      async () => {
        const result = await checkMetricsEnabled()

        expect(result).toEqual({ enabled: false, hasError: false })

        await waitUntil(
          () => getGlobalConfig().metricsStatusCache?.enabled === true,
        )

        expect(axiosCalls).toHaveLength(1)
        expect(getGlobalConfig().metricsStatusCache?.enabled).toBe(true)

        return result
      },
    )

    expect(result).toEqual({ enabled: false, hasError: false })
  })

  it('uses CLAUDE_CODE_ORGANIZATION_UUID when oauth account info is absent', async () => {
    process.env.CLAUDE_CODE_ORGANIZATION_UUID = 'org-from-env'
    saveGlobalConfig(current => ({
      ...current,
      oauthAccount: undefined,
    }))

    const result = await withMockCurrentSession(
      makeDirectApiKeySession('api-key'),
      () => checkMetricsEnabled(),
    )

    expect(result).toEqual({ enabled: true, hasError: false })
    expect(axiosCalls).toEqual([
      {
        url: 'https://api.noumena.test/api/claude_code/organizations/metrics_enabled',
        options: {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'ncode/test-version',
            'x-organization-uuid': 'org-from-env',
            'x-api-key': 'api-key',
          },
          timeout: 5000,
        },
      },
    ])
  })

  it('returns disabled without network for subscriber sessions that lack profile scope', async () => {
    const result = await withMockCurrentSession(
      makeServiceOauthSession(['user:inference']),
      () => checkMetricsEnabled(),
    )

    expect(result).toEqual({ enabled: false, hasError: false })
    expect(axiosCalls).toEqual([])
    expect(getGlobalConfig().metricsStatusCache).toBeUndefined()
  })
})
