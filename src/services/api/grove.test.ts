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
import {
  clearOAuthTokenCache,
  saveOAuthTokensIfNeeded,
} from '../../utils/auth.js'
import {
  _setGlobalConfigCacheForTesting,
  enableConfigs,
  getGlobalConfig,
  saveGlobalConfig,
} from '../../utils/config.js'
import { getSecureStorage } from '../../utils/secureStorage/index.js'
import {
  canUseGroveForSession,
  getGroveNoticeConfig,
  getGroveSettings,
  isQualifiedForGrove,
} from './grove.js'

let tempConfigDir = ''
const axiosCalls: Array<{ url: string; options?: unknown }> = []
const originalAxiosGet = axios.get
const originalMacro = (globalThis as { MACRO?: unknown }).MACRO

const envKeys = [
  'NODE_ENV',
  'CI',
  'NCODE_CONFIG_DIR',
  'CLAUDE_CONFIG_DIR',
  'NOUMENA_PLATFORM_BASE_URL',
  'ANTHROPIC_API_KEY',
  'NOUMENA_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'NCODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
  'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
  'CLAUDE_CODE_ENTRYPOINT',
  'USER_TYPE',
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
  process.env.NODE_ENV = 'development'
  delete process.env.CI
  process.env.NCODE_CONFIG_DIR = tempConfigDir
  process.env.CLAUDE_CONFIG_DIR = tempConfigDir
  process.env.NOUMENA_PLATFORM_BASE_URL = 'https://api.noumena.test'
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.NOUMENA_API_KEY
  delete process.env.ANTHROPIC_AUTH_TOKEN
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN
  delete process.env.NCODE_OAUTH_TOKEN_FILE_DESCRIPTOR
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR
  delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
  delete process.env.CLAUDE_CODE_ENTRYPOINT
  delete process.env.USER_TYPE

  ;(globalThis as { MACRO?: Record<string, unknown> }).MACRO = {
    ...(typeof originalMacro === 'object' && originalMacro !== null
      ? (originalMacro as Record<string, unknown>)
      : {}),
    VERSION: 'test-version',
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
  throw new Error('Timed out waiting for background Grove refresh')
}

function seedManagedConsumerSession(): void {
  saveOAuthTokensIfNeeded({
    accessToken: 'oauth-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 10 * 60_000,
    scopes: ['user:profile', 'user:inference'],
    subscriptionType: 'max',
    rateLimitTier: 'tier-1',
  })
  saveGlobalConfig(current => ({
    ...current,
    oauthAccount: {
      accountUuid: 'acct-123',
      emailAddress: 'user@example.com',
      organizationUuid: 'org-123',
      organizationName: 'Acme',
    },
    groveConfigCache: undefined,
  }))
}

function makeGroveSession(overrides: Record<string, unknown> = {}) {
  return {
    principalSource: 'managed_oauth',
    identity: {
      email: 'user@example.com',
      accountUuid: 'acct-123',
      organizationUuid: 'org-123',
      organizationName: 'Acme',
    },
    subscription: {
      subscriptionName: 'Noumena Max',
      subscriptionType: 'max',
      rateLimitTier: 'tier-1',
    },
    ...overrides,
  }
}

beforeAll(async () => {
  tempConfigDir = await mkdtemp(join(tmpdir(), 'ncode-grove-test-'))
})

beforeEach(() => {
  restoreEnv()
  setStableTestRuntime()
  enableConfigs()
  clearOAuthTokenCache()
  getSecureStorage().delete()
  _setGlobalConfigCacheForTesting(null)
  getGroveSettings.cache.clear?.()
  getGroveNoticeConfig.cache.clear?.()
  axiosCalls.length = 0

  axios.get = (async (url: string, options?: unknown) => {
    axiosCalls.push({ url, options })
    return {
      data: {
        grove_enabled: true,
        domain_excluded: false,
        notice_is_grace_period: true,
        notice_reminder_frequency: 7,
      },
    }
  }) as typeof axios.get
})

afterEach(() => {
  axios.get = originalAxiosGet
  clearOAuthTokenCache()
  getSecureStorage().delete()
  _setGlobalConfigCacheForTesting(null)
  getGroveSettings.cache.clear?.()
  getGroveNoticeConfig.cache.clear?.()
  restoreEnv()
  ;(globalThis as { MACRO?: unknown }).MACRO = originalMacro
})

afterAll(async () => {
  await rm(tempConfigDir, { recursive: true, force: true })
})

describe('Grove canonical auth gating', () => {
  it('requires a managed consumer session with an account id', () => {
    expect(canUseGroveForSession(makeGroveSession())).toBe(true)
    expect(
      canUseGroveForSession(
        makeGroveSession({
          principalSource: 'direct_api_key_env',
        }),
      ),
    ).toBe(false)
    expect(
      canUseGroveForSession(
        makeGroveSession({
          subscription: {
            subscriptionName: 'Noumena Team',
            subscriptionType: 'team',
            rateLimitTier: 'tier-1',
          },
        }),
      ),
    ).toBe(false)
    expect(
      canUseGroveForSession(
        makeGroveSession({
          identity: {
            email: 'user@example.com',
            accountUuid: null,
            organizationUuid: 'org-123',
            organizationName: 'Acme',
          },
        }),
      ),
    ).toBe(false)
  })

  it('fails closed before network for static BYOK env-key sessions', async () => {
    process.env.ANTHROPIC_API_KEY = 'byok-key'
    saveGlobalConfig(current => ({
      ...current,
      oauthAccount: undefined,
      groveConfigCache: undefined,
    }))

    expect(await isQualifiedForGrove()).toBe(false)
    expect(axiosCalls).toEqual([])
  })

  it('returns false on cold cache and refreshes Grove config in the background for managed consumer sessions', async () => {
    seedManagedConsumerSession()

    expect(await isQualifiedForGrove()).toBe(false)

    await waitUntil(
      () => getGlobalConfig().groveConfigCache?.['acct-123']?.grove_enabled === true,
    )

    expect(axiosCalls).toEqual([
      expect.objectContaining({
        url: 'https://api.noumena.test/api/claude_code_grove',
        options: expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer oauth-token',
            'anthropic-beta': 'oauth-2025-04-20',
          }),
          timeout: 3000,
        }),
      }),
    ])
  })

  it('returns a fresh cached grove decision without hitting the network', async () => {
    seedManagedConsumerSession()
    saveGlobalConfig(current => ({
      ...current,
      groveConfigCache: {
        'acct-123': {
          grove_enabled: true,
          timestamp: Date.now(),
        },
      },
    }))

    expect(await isQualifiedForGrove()).toBe(true)
    expect(axiosCalls).toEqual([])
  })
})
