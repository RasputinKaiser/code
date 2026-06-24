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
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'http'
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
  checkCachedPassesEligibility,
  fetchAndStorePassesEligibility,
  getCachedOrFetchPassesEligibility,
  shouldCheckForPassesForSession,
} from './referral.js'

let tempConfigDir = ''
let platformBaseUrl = ''
let platformServer: null | Server = null
let eligibilityResponse = makeEligibility(true, 3)
let customEligibilityHandler:
  | null
  | ((req: IncomingMessage, res: ServerResponse) => Promise<void> | void) = null
const eligibilityCalls: Array<{
  url: string
  headers: Record<string, string | null>
  params: Record<string, string>
}> = []
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
  process.env.NOUMENA_PLATFORM_BASE_URL = platformBaseUrl
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

function seedSubscriberAccount(): void {
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
    },
    passesEligibilityCache: undefined,
  }))
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Timed out waiting for background referral refresh')
}

function makeEligibility(eligible: boolean, remainingPasses: number) {
  return {
    eligible,
    referral_link: 'https://example.com/passes',
    remaining_passes: remainingPasses,
    max_passes: 5,
    referrer_reward: null,
    campaign_version: 'v1',
  }
}

function makeReferralSession(overrides: Record<string, unknown> = {}) {
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
      organizationName: 'Acme',
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
    accessTokenExpiresAt: Date.now() + 10 * 60_000,
    refreshTokenPresent: true,
    apiKey: null,
    rawAuthTokenSource: 'managed_oauth',
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

function sendJson(res: ServerResponse, body: unknown): void {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function recordEligibilityCall(req: IncomingMessage): void {
  const requestUrl = new URL(req.url ?? '/', platformBaseUrl)
  eligibilityCalls.push({
    url: `${requestUrl.origin}${requestUrl.pathname}`,
    headers: {
      Authorization: req.headers.authorization ?? null,
      'x-organization-uuid': req.headers['x-organization-uuid'] ?? null,
    },
    params: Object.fromEntries(requestUrl.searchParams.entries()),
  })
}

beforeAll(async () => {
  tempConfigDir = await mkdtemp(join(tmpdir(), 'ncode-referral-test-'))

  platformServer = createServer((req, res) => {
    const requestUrl = new URL(req.url ?? '/', platformBaseUrl || 'http://127.0.0.1')
    if (
      requestUrl.pathname !==
      '/api/oauth/organizations/org-123/referral/eligibility'
    ) {
      res.statusCode = 404
      res.end('not found')
      return
    }

    recordEligibilityCall(req)
    if (customEligibilityHandler) {
      void customEligibilityHandler(req, res)
      return
    }

    sendJson(res, eligibilityResponse)
  })

  await new Promise<void>((resolve, reject) => {
    platformServer?.listen(0, '127.0.0.1', err => {
      if (err) {
        reject(err)
        return
      }
      resolve()
    })
  })

  const address = platformServer.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind referral test server')
  }
  platformBaseUrl = `http://127.0.0.1:${address.port}`
})

beforeEach(() => {
  restoreEnv()
  setStableTestRuntime()
  enableConfigs()
  clearOAuthTokenCache()
  getSecureStorage().delete()
  _setGlobalConfigCacheForTesting(null)
  eligibilityCalls.length = 0
  eligibilityResponse = makeEligibility(true, 3)
  customEligibilityHandler = null
  seedSubscriberAccount()
})

afterEach(() => {
  clearOAuthTokenCache()
  getSecureStorage().delete()
  _setGlobalConfigCacheForTesting(null)
  restoreEnv()
  ;(globalThis as { MACRO?: unknown }).MACRO = originalMacro
})

afterAll(async () => {
  if (platformServer) {
    await new Promise<void>((resolve, reject) => {
      platformServer?.close(err => {
        if (err) {
          reject(err)
          return
        }
        resolve()
      })
    })
  }
  await rm(tempConfigDir, { recursive: true, force: true })
})

describe('referral passes eligibility', () => {
  it('coalesces concurrent eligibility fetches into one request and caches the result', async () => {
    let resolveFetch:
      | undefined
      | ((payload: ReturnType<typeof makeEligibility>) => void)

    customEligibilityHandler = async (_req, res) => {
      const payload = await new Promise<ReturnType<typeof makeEligibility>>(
        resolve => {
          resolveFetch = resolve
        },
      )
      sendJson(res, payload)
    }

    const first = fetchAndStorePassesEligibility()
    const second = fetchAndStorePassesEligibility()

    await waitUntil(() => typeof resolveFetch === 'function')

    expect(eligibilityCalls).toHaveLength(1)

    resolveFetch?.(makeEligibility(true, 2))

    await expect(first).resolves.toEqual(makeEligibility(true, 2))
    await expect(second).resolves.toEqual(makeEligibility(true, 2))
    expect(getGlobalConfig().passesEligibilityCache?.['org-123']).toMatchObject(
      makeEligibility(true, 2),
    )
  })

  it('returns null on cold cache and refreshes eligibility in the background', async () => {
    const result = await getCachedOrFetchPassesEligibility()

    expect(result).toBeNull()

    await waitUntil(
      () => getGlobalConfig().passesEligibilityCache?.['org-123'] !== undefined,
    )

    expect(
      eligibilityCalls.some(
        call =>
          call.url ===
            `${platformBaseUrl}/api/oauth/organizations/org-123/referral/eligibility` &&
          call.params.campaign === 'claude_code_guest_pass',
      ),
    ).toBe(true)
    expect(checkCachedPassesEligibility()).toEqual({
      eligible: true,
      needsRefresh: false,
      hasCache: true,
    })
  })

  it('returns stale cached eligibility immediately and refreshes it in the background', async () => {
    saveGlobalConfig(current => ({
      ...current,
      passesEligibilityCache: {
        ...current.passesEligibilityCache,
        'org-123': {
          ...makeEligibility(false, 1),
          timestamp: Date.now() - 25 * 60 * 60 * 1000,
        },
      },
    }))

    const result = await getCachedOrFetchPassesEligibility()

    expect(result).toEqual(makeEligibility(false, 1))

    await waitUntil(
      () =>
        getGlobalConfig().passesEligibilityCache?.['org-123']?.eligible === true,
    )

    expect(eligibilityCalls).toHaveLength(1)
    expect(getGlobalConfig().passesEligibilityCache?.['org-123']).toMatchObject(
      makeEligibility(true, 3),
    )
  })

  it('requires a usable managed max session with an organization before passes checks are enabled', () => {
    expect(shouldCheckForPassesForSession(makeReferralSession())).toBe(true)
    expect(
      shouldCheckForPassesForSession(
        makeReferralSession({
          principalSource: 'direct_api_key_env',
          principalKind: 'api_key_user',
          headersKind: 'api_key',
          hasUsableToken: false,
          hasUsableApiKey: true,
          accessToken: null,
          apiKey: 'api-key',
          providerPlan: {
            mode: 'byok_static_env',
            source: 'direct_api_key_env',
            staticKeyEnvVarName: 'ANTHROPIC_API_KEY',
          },
          rawAuthTokenSource: null,
          rawApiKeySource: 'ANTHROPIC_API_KEY',
          sourceDetails: {
            usedLegacyCompat: true,
            usedEnvVar: true,
            usedFileDescriptor: false,
            usedHelper: false,
          },
        }),
      ),
    ).toBe(false)
    expect(
      shouldCheckForPassesForSession(
        makeReferralSession({
          subscription: {
            subscriptionName: 'Noumena Pro',
            subscriptionType: 'pro',
            rateLimitTier: 'tier-1',
          },
        }),
      ),
    ).toBe(false)
    expect(
      shouldCheckForPassesForSession(
        makeReferralSession({
          sessionState: 'expired',
        }),
      ),
    ).toBe(false)
    expect(
      shouldCheckForPassesForSession(
        makeReferralSession({
          identity: {
            email: 'user@example.com',
            accountUuid: 'acct-123',
            organizationUuid: null,
            organizationName: null,
          },
        }),
      ),
    ).toBe(false)
  })
})
