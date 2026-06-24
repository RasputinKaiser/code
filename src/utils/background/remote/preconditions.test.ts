import axios from 'axios'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  _setAuthRuntimeDepsForTesting,
  clearOAuthTokenCache,
  saveOAuthTokensIfNeeded,
} from '../../auth.js'
import { enableConfigs, _setGlobalConfigCacheForTesting } from '../../config.js'
import { getSecureStorage } from '../../secureStorage/index.js'
import {
  checkGithubAppInstalled,
  checkGithubTokenSynced,
  checkNeedsClaudeAiLogin,
} from './preconditions.js'

const envKeys = [
  'NODE_ENV',
  'CI',
  'NCODE_CONFIG_DIR',
  'CLAUDE_CONFIG_DIR',
  'NOUMENA_PLATFORM_BASE_URL',
  'NOUMENA_ISSUER_BASE_URL',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'NCODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
  'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
  'CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'NOUMENA_API_KEY',
  'CLAUDE_CODE_ENTRYPOINT',
  'USER_TYPE',
  'CLAUDE_CODE_REMOTE',
] as const

const originalEnv = Object.fromEntries(
  envKeys.map(key => [key, process.env[key]]),
) as Record<(typeof envKeys)[number], string | undefined>

const originalAxiosGet = axios.get
let tempConfigDir = ''

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
  process.env.NODE_ENV = 'production'
  delete process.env.CI
  process.env.NCODE_CONFIG_DIR = tempConfigDir
  process.env.CLAUDE_CONFIG_DIR = tempConfigDir
  process.env.NOUMENA_PLATFORM_BASE_URL = 'https://api.noumena.test'
  process.env.NOUMENA_ISSUER_BASE_URL = 'https://auth.noumena.test'
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN
  delete process.env.NCODE_OAUTH_TOKEN_FILE_DESCRIPTOR
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR
  delete process.env.CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR
  delete process.env.ANTHROPIC_AUTH_TOKEN
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.NOUMENA_API_KEY
  delete process.env.CLAUDE_CODE_ENTRYPOINT
  delete process.env.USER_TYPE
  delete process.env.CLAUDE_CODE_REMOTE
}

function saveExpiredManagedTokens(): void {
  saveOAuthTokensIfNeeded({
    accessToken: 'expired-access-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() - 60_000,
    scopes: ['user:profile', 'user:inference'],
    subscriptionType: 'max',
    rateLimitTier: 'tier_1',
  })
  clearOAuthTokenCache()
}

beforeEach(async () => {
  tempConfigDir = await mkdtemp(join(tmpdir(), 'ncode-remote-preconditions-'))
  restoreEnv()
  setStableTestRuntime()
  enableConfigs()
  clearOAuthTokenCache()
  getSecureStorage().delete()
  _setGlobalConfigCacheForTesting(null)
  _setAuthRuntimeDepsForTesting(null)
})

afterEach(async () => {
  axios.get = originalAxiosGet
  clearOAuthTokenCache()
  getSecureStorage().delete()
  _setGlobalConfigCacheForTesting(null)
  _setAuthRuntimeDepsForTesting(null)
  restoreEnv()
  if (tempConfigDir) {
    await rm(tempConfigDir, { recursive: true, force: true })
    tempConfigDir = ''
  }
})

afterAll(() => {
  restoreEnv()
})

describe('remote precondition auth guards', () => {
  it('does not report managed login required for direct API key sessions', async () => {
    process.env.NOUMENA_API_KEY = 'noumena-api-key'

    await expect(checkNeedsClaudeAiLogin()).resolves.toBe(false)
  })

  it('reports that managed login is still required when refresh and re-auth cannot recover', async () => {
    saveExpiredManagedTokens()
    _setAuthRuntimeDepsForTesting({
      refreshOAuthToken: async () => {
        throw new Error('invalid_grant')
      },
      performManagedReauthentication: async () => {
        throw new Error('browser launch failed')
      },
    })

    await expect(checkNeedsClaudeAiLogin()).resolves.toBe(true)
  })

  it('does not hit network for GitHub access checks when managed OAuth is expired', async () => {
    let networkCalls = 0
    axios.get = (async () => {
      networkCalls += 1
      throw new Error('network should not be reached')
    }) as typeof axios.get

    saveExpiredManagedTokens()

    await expect(checkGithubAppInstalled('noumena', 'ncode')).resolves.toBe(
      false,
    )
    await expect(checkGithubTokenSynced()).resolves.toBe(false)
    expect(networkCalls).toBe(0)
  })

  it('does not hit network for GitHub access checks when only direct API key auth is present', async () => {
    let networkCalls = 0
    axios.get = (async () => {
      networkCalls += 1
      throw new Error('network should not be reached')
    }) as typeof axios.get

    process.env.NOUMENA_API_KEY = 'noumena-api-key'

    await expect(checkGithubAppInstalled('noumena', 'ncode')).resolves.toBe(
      false,
    )
    await expect(checkGithubTokenSynced()).resolves.toBe(false)
    expect(networkCalls).toBe(0)
  })
})
