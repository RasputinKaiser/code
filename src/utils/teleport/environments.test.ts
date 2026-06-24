import axios from 'axios'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  createMockOauthServer,
  type MockOauthServer,
  withMockOauthEnvironment,
} from '../../services/oauth/oauthTestHarness.js'
import {
  clearOAuthTokenCache,
  saveOAuthTokensIfNeeded,
} from '../auth.js'
import { enableConfigs, _setGlobalConfigCacheForTesting } from '../config.js'
import { getSecureStorage } from '../secureStorage/index.js'
import {
  createDefaultCloudEnvironment,
  fetchEnvironments,
} from './environments.js'
import { MANAGED_REMOTE_AUTH_REQUIRED_MESSAGE } from './api.js'

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
const originalAxiosPost = axios.post
let tempConfigDir = ''
const liveServers: MockOauthServer[] = []

function getHeaderValue(
  headers: unknown,
  key: string,
): string | undefined {
  if (!headers || typeof headers !== 'object') {
    return undefined
  }

  const direct = (headers as Record<string, string | undefined>)[key]
  if (typeof direct === 'string') {
    return direct
  }

  const getter = (headers as { get?: (name: string) => string | undefined }).get
  if (typeof getter === 'function') {
    return getter.call(headers, key)
  }

  return undefined
}

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
  tempConfigDir = await mkdtemp(join(tmpdir(), 'ncode-teleport-environments-'))
  restoreEnv()
  setStableTestRuntime()
  enableConfigs()
  clearOAuthTokenCache()
  getSecureStorage().delete()
  _setGlobalConfigCacheForTesting(null)
})

afterEach(async () => {
  axios.get = originalAxiosGet
  axios.post = originalAxiosPost
  clearOAuthTokenCache()
  getSecureStorage().delete()
  _setGlobalConfigCacheForTesting(null)
  restoreEnv()
  while (liveServers.length > 0) {
    await liveServers.pop()!.close()
  }
  if (tempConfigDir) {
    await rm(tempConfigDir, { recursive: true, force: true })
    tempConfigDir = ''
  }
})

afterAll(() => {
  restoreEnv()
})

describe('teleport environment auth guards', () => {
  it('refreshes an expired managed OAuth token before listing environments', async () => {
    const server = await createMockOauthServer()
    liveServers.push(server)

    let networkCalls = 0
    axios.get = (async (url, config) => {
      if (String(url).includes('/api/oauth/profile')) {
        return originalAxiosGet(url, config)
      }

      networkCalls += 1
      expect(String(url)).toContain('/v1/environment_providers')
      return {
        data: {
          environments: [
            {
              kind: 'noumena_cloud',
              environment_id: 'env-1',
              name: 'Env 1',
              created_at: '2026-04-22T00:00:00Z',
              state: 'active',
            },
          ],
          has_more: false,
          first_id: 'env-1',
          last_id: 'env-1',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as Awaited<ReturnType<typeof axios.get>>
    }) as typeof axios.get

    await withMockOauthEnvironment(server, async () => {
      saveExpiredManagedTokens()

      const environments = await fetchEnvironments()
      expect(environments).toEqual([
        {
          kind: 'noumena_cloud',
          environment_id: 'env-1',
          name: 'Env 1',
          created_at: '2026-04-22T00:00:00Z',
          state: 'active',
        },
      ])
      expect(server.refreshRequests).toHaveLength(1)
      expect(networkCalls).toBe(1)
    })
  })

  it('refreshes an expired managed OAuth token before creating a cloud environment', async () => {
    const server = await createMockOauthServer()
    liveServers.push(server)

    let networkCalls = 0
    axios.post = (async (url, data, config) => {
      if (String(url).includes('/oauth/token')) {
        return originalAxiosPost(url, data, config)
      }

      networkCalls += 1
      expect(String(url)).toContain('/v1/environment_providers/cloud/create')
      expect(getHeaderValue(config?.headers, 'Authorization')).toBe(
        'Bearer refreshed-access-token',
      )
      expect(getHeaderValue(config?.headers, 'x-organization-uuid')).toBe(
        'org-test',
      )
      return {
        data: {
          kind: 'noumena_cloud',
          environment_id: 'env-1',
          name: 'dev-env',
          created_at: '2026-04-22T00:00:00Z',
          state: 'active',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as Awaited<ReturnType<typeof axios.post>>
    }) as typeof axios.post

    await withMockOauthEnvironment(server, async () => {
      saveExpiredManagedTokens()

      await expect(createDefaultCloudEnvironment('dev-env')).resolves.toEqual({
        kind: 'noumena_cloud',
        environment_id: 'env-1',
        name: 'dev-env',
        created_at: '2026-04-22T00:00:00Z',
        state: 'active',
      })
      expect(server.refreshRequests).toHaveLength(1)
      expect(networkCalls).toBe(1)
    })
  })
})
