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
import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import type { ResolvedAuthSession } from '../auth/runtime/types.js'
import {
  _setGlobalConfigCacheForTesting,
  enableConfigs,
  saveGlobalConfig,
} from './config.js'
import { getCoreUserData, resetUserCache } from './user.js'

let tempConfigDir = ''
const originalMacro = (globalThis as { MACRO?: unknown }).MACRO

const envKeys = [
  'NODE_ENV',
  'NCODE_CONFIG_DIR',
  'CLAUDE_CONFIG_DIR',
  'USER_TYPE',
  'GITHUB_ACTIONS',
  'GITHUB_ACTOR',
  'GITHUB_ACTOR_ID',
  'GITHUB_REPOSITORY',
  'GITHUB_REPOSITORY_ID',
  'GITHUB_REPOSITORY_OWNER',
  'GITHUB_REPOSITORY_OWNER_ID',
  'COO_CREATOR',
  'NCODE_BUILD_MODE',
  'ANTHROPIC_API_KEY',
  'NOUMENA_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
] as const

const originalEnv = Object.fromEntries(
  envKeys.map(key => [key, process.env[key]]),
) as Record<(typeof envKeys)[number], string | undefined>

function restoreEnv(): void {
  for (const key of envKeys) {
    const value = originalEnv[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

function setStableTestRuntime(): void {
  process.env.NODE_ENV = 'test'
  process.env.NCODE_CONFIG_DIR = tempConfigDir
  process.env.CLAUDE_CONFIG_DIR = tempConfigDir
  delete process.env.USER_TYPE
  delete process.env.GITHUB_ACTIONS
  delete process.env.GITHUB_ACTOR
  delete process.env.GITHUB_ACTOR_ID
  delete process.env.GITHUB_REPOSITORY
  delete process.env.GITHUB_REPOSITORY_ID
  delete process.env.GITHUB_REPOSITORY_OWNER
  delete process.env.GITHUB_REPOSITORY_OWNER_ID
  delete process.env.COO_CREATOR
  delete process.env.NCODE_BUILD_MODE
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.NOUMENA_API_KEY
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN
}

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
      rateLimitTier: 'tier-1',
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

beforeAll(async () => {
  tempConfigDir = await mkdtemp(join(tmpdir(), 'ncode-user-test-'))
})

beforeEach(() => {
  restoreEnv()
  setStableTestRuntime()
  ;(globalThis as { MACRO?: Record<string, unknown> }).MACRO = {
    VERSION: 'test-version',
  }
  enableConfigs()
  resetUserCache()
  _setGlobalConfigCacheForTesting(null)
  saveGlobalConfig(current => ({
    ...current,
    claudeCodeFirstTokenDate: undefined,
  }))
})

afterEach(() => {
  resetUserCache()
  _setGlobalConfigCacheForTesting(null)
  ;(globalThis as { MACRO?: unknown }).MACRO = originalMacro
  restoreEnv()
})

afterAll(async () => {
  await rm(tempConfigDir, { recursive: true, force: true })
})

describe('getCoreUserData', () => {
  it('uses canonical managed-session identity and subscription metadata for analytics', () => {
    const firstTokenDate = '2026-01-02T03:04:05.000Z'
    saveGlobalConfig(current => ({
      ...current,
      claudeCodeFirstTokenDate: firstTokenDate,
    }))

    const user = withMockCurrentSession(makeSession(), () =>
      getCoreUserData(true),
    )

    expect(user).toMatchObject({
      email: 'user@example.com',
      organizationUuid: 'org-123',
      accountUuid: 'acct-123',
      subscriptionType: 'max',
      rateLimitTier: 'tier-1',
      firstTokenTime: new Date(firstTokenDate).getTime(),
    })
  })

  it('does not treat direct api-key sessions as oauth-backed analytics sessions', () => {
    const user = withMockCurrentSession(
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
        apiKey: 'api-key',
        rawAuthTokenSource: null,
        rawApiKeySource: 'NOUMENA_API_KEY',
      }),
      () => getCoreUserData(true),
    )

    expect(user.email).toBeUndefined()
    expect(user.organizationUuid).toBeUndefined()
    expect(user.accountUuid).toBeUndefined()
    expect(user.subscriptionType).toBeUndefined()
    expect(user.rateLimitTier).toBeUndefined()
    expect(user.firstTokenTime).toBeUndefined()
  })
})
