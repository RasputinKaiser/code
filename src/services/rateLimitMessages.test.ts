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
} from '../utils/auth.js'
import {
  _setGlobalConfigCacheForTesting,
  enableConfigs,
  saveGlobalConfig,
} from '../utils/config.js'
import { getSecureStorage } from '../utils/secureStorage/index.js'
import type { ClaudeAILimits } from './claudeAiLimits.js'
import {
  buildRateLimitMessageSessionState,
  getRateLimitErrorMessage,
  getRateLimitWarning,
  getUsingOverageText,
  isOverageProvisioningAllowedForRateLimitState,
} from './rateLimitMessages.js'

let tempConfigDir = ''

const envKeys = [
  'NODE_ENV',
  'CI',
  'NCODE_CONFIG_DIR',
  'CLAUDE_CONFIG_DIR',
  'ANTHROPIC_API_KEY',
  'NOUMENA_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'NCODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
  'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
  'CLAUDE_CODE_ENTRYPOINT',
  'USER_TYPE',
  'NCODE_BUILD_MODE',
  'IS_DEMO',
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
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.NOUMENA_API_KEY
  delete process.env.ANTHROPIC_AUTH_TOKEN
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN
  delete process.env.NCODE_OAUTH_TOKEN_FILE_DESCRIPTOR
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR
  delete process.env.CLAUDE_CODE_ENTRYPOINT
  delete process.env.USER_TYPE
  delete process.env.NCODE_BUILD_MODE
}

function makeLimits(overrides: Partial<ClaudeAILimits> = {}): ClaudeAILimits {
  return {
    status: 'allowed',
    unifiedRateLimitFallbackAvailable: false,
    isUsingOverage: false,
    ...overrides,
  }
}

function seedManagedSession(params: {
  subscriptionType?: string | null
  organizationRole?: string | null
  hasExtraUsageEnabled?: boolean
  billingType?: string | null
} = {}): void {
  saveOAuthTokensIfNeeded({
    accessToken: 'oauth-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 10 * 60_000,
    scopes: ['user:profile', 'user:inference'],
    subscriptionType: params.subscriptionType ?? 'max',
    rateLimitTier: 'tier-1',
  })
  saveGlobalConfig(current => ({
    ...current,
    oauthAccount: {
      accountUuid: 'acct-123',
      emailAddress: 'user@example.com',
      organizationUuid: 'org-123',
      organizationName: 'Acme',
      organizationRole: params.organizationRole ?? null,
      hasExtraUsageEnabled: params.hasExtraUsageEnabled ?? false,
      billingType: params.billingType ?? 'stripe_subscription',
    },
  }))
}

beforeAll(async () => {
  tempConfigDir = await mkdtemp(
    join(tmpdir(), 'ncode-rate-limit-messages-test-'),
  )
})

beforeEach(() => {
  restoreEnv()
  setStableTestRuntime()
  enableConfigs()
  clearOAuthTokenCache()
  getSecureStorage().delete()
  _setGlobalConfigCacheForTesting(null)
  saveGlobalConfig(current => ({
    ...current,
    oauthAccount: undefined,
  }))
})

afterEach(() => {
  clearOAuthTokenCache()
  getSecureStorage().delete()
  _setGlobalConfigCacheForTesting(null)
  restoreEnv()
})

afterAll(async () => {
  await rm(tempConfigDir, { recursive: true, force: true })
})

describe('rateLimitMessages canonical runtime helpers', () => {
  it('builds managed-only session state from canonical session truth', () => {
    expect(
      buildRateLimitMessageSessionState(
        {
          principalSource: 'managed_oauth',
          subscription: {
            subscriptionName: 'Noumena Team',
            subscriptionType: 'team',
            rateLimitTier: 'tier-1',
          },
        },
        {
          hasExtraUsageEnabled: true,
          billingType: 'stripe_subscription',
        },
      ),
    ).toEqual({
      subscriptionType: 'team',
      hasExtraUsageEnabled: true,
      billingType: 'stripe_subscription',
    })

    expect(
      buildRateLimitMessageSessionState(
        {
          principalSource: 'direct_api_key_env',
          subscription: {
            subscriptionName: 'Noumena Max',
            subscriptionType: 'max',
            rateLimitTier: 'tier-1',
          },
        },
        {
          hasExtraUsageEnabled: true,
          billingType: 'stripe_subscription',
        },
      ),
    ).toEqual({
      subscriptionType: null,
      hasExtraUsageEnabled: false,
      billingType: null,
    })
  })

  it('allows overage provisioning only for supported billing-backed managed states', () => {
    expect(
      isOverageProvisioningAllowedForRateLimitState({
        subscriptionType: 'team',
        billingType: 'stripe_subscription',
      }),
    ).toBe(true)

    expect(
      isOverageProvisioningAllowedForRateLimitState({
        subscriptionType: 'team',
        billingType: 'aws_marketplace',
      }),
    ).toBe(false)

    expect(
      isOverageProvisioningAllowedForRateLimitState({
        subscriptionType: null,
        billingType: 'stripe_subscription',
      }),
    ).toBe(false)
  })

  it('suppresses team warnings when extra usage is already enabled for non-billing users', () => {
    seedManagedSession({
      subscriptionType: 'team',
      hasExtraUsageEnabled: true,
      organizationRole: null,
    })

    expect(
      getRateLimitWarning(
        makeLimits({
          status: 'allowed_warning',
          rateLimitType: 'five_hour',
          utilization: 0.8,
        }),
        'sonnet',
      ),
    ).toBeNull()
  })

  it('shows the extra-usage upsell for eligible team sessions without extra usage enabled', () => {
    seedManagedSession({
      subscriptionType: 'team',
      hasExtraUsageEnabled: false,
      organizationRole: null,
      billingType: 'stripe_subscription',
    })

    expect(
      getRateLimitWarning(
        makeLimits({
          status: 'allowed_warning',
          rateLimitType: 'five_hour',
          utilization: 0.8,
        }),
        'sonnet',
      ),
    ).toContain('/extra-usage to request more')
  })

  it('uses canonical subscription truth for standard model limit wording', () => {
    seedManagedSession({
      subscriptionType: 'pro',
    })
    expect(
      getRateLimitErrorMessage(
        makeLimits({
          status: 'rejected',
          rateLimitType: 'seven_day_sonnet',
        }),
        'sonnet',
      ),
    ).toBe("You've hit your weekly limit")

    clearOAuthTokenCache()
    getSecureStorage().delete()
    _setGlobalConfigCacheForTesting(null)
    process.env.ANTHROPIC_API_KEY = 'byok-key'
    saveGlobalConfig(current => ({
      ...current,
      oauthAccount: undefined,
    }))

    expect(
      getRateLimitErrorMessage(
        makeLimits({
          status: 'rejected',
          rateLimitType: 'seven_day_sonnet',
        }),
        'sonnet',
      ),
    ).toBe("You've hit your standard model limit")
  })

  it('uses canonical subscription truth for overage transition wording', () => {
    const resetsAt = Math.floor(Date.now() / 1000) + 3600

    seedManagedSession({
      subscriptionType: 'pro',
    })
    expect(
      getUsingOverageText(
        makeLimits({
          rateLimitType: 'seven_day_sonnet',
          resetsAt,
        }),
      ),
    ).toContain('Your weekly limit resets')

    clearOAuthTokenCache()
    getSecureStorage().delete()
    _setGlobalConfigCacheForTesting(null)
    process.env.ANTHROPIC_API_KEY = 'byok-key'
    saveGlobalConfig(current => ({
      ...current,
      oauthAccount: undefined,
    }))

    expect(
      getUsingOverageText(
        makeLimits({
          rateLimitType: 'seven_day_sonnet',
          resetsAt,
        }),
      ),
    ).toContain('Your standard model limit resets')
  })
})
