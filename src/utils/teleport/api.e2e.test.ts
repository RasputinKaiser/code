import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { setIsInteractive } from '../../bootstrap/state.js'
import {
  createMockOauthServer,
  type MockOauthServer,
  withMockOauthEnvironment,
} from '../../services/oauth/oauthTestHarness.js'
import { enableConfigs, _setGlobalConfigCacheForTesting } from '../config.js'
import { clearOAuthTokenCache, saveOAuthTokensIfNeeded } from '../auth.js'
import { getSecureStorage } from '../secureStorage/index.js'
import {
  fetchCodeSessionsFromSessionsAPI,
  fetchSession,
  getSessionRepoDisplay,
  MANAGED_REMOTE_AUTH_REQUIRED_MESSAGE,
  type SessionResource,
} from './api.js'

const envKeys = [
  'NODE_ENV',
  'CI',
  'NOUMENA_ISSUER_BASE_URL',
  'NOUMENA_OAUTH_WEB_BASE_URL',
  'NOUMENA_PLATFORM_BASE_URL',
  'NOUMENA_OAUTH_CLIENT_ID',
  'NCODE_CONFIG_DIR',
  'CLAUDE_CONFIG_DIR',
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

const liveServers: MockOauthServer[] = []
let tempConfigDir = ''

function makeSession(
  id: string,
  overrides?: Partial<SessionResource>,
): SessionResource {
  return {
    type: 'session',
    id,
    title: `Session ${id}`,
    session_status: 'idle',
    environment_id: 'env-1',
    created_at: '2026-04-22T00:00:00Z',
    updated_at: '2026-04-22T00:00:00Z',
    session_context: {
      sources: [
        {
          type: 'git_repository',
          url: 'https://github.com/noumena/ncode',
          revision: 'main',
        },
      ],
      outcomes: null,
      cwd: '/workspace',
      custom_system_prompt: null,
      append_system_prompt: null,
      model: null,
    },
    ...overrides,
  }
}

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
  process.env.NODE_ENV = 'production'
  delete process.env.CI
  process.env.NCODE_CONFIG_DIR = tempConfigDir
  process.env.CLAUDE_CONFIG_DIR = tempConfigDir
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

function saveManagedTokens(accessToken = 'access-token'): void {
  saveOAuthTokensIfNeeded({
    accessToken,
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 60 * 60_000,
    scopes: ['user:profile', 'user:inference'],
    subscriptionType: 'max',
    rateLimitTier: 'tier_1',
  })
  clearOAuthTokenCache()
}

beforeEach(async () => {
  tempConfigDir = await mkdtemp(join(tmpdir(), 'ncode-teleport-api-e2e-'))
  restoreEnv()
  setStableTestRuntime()
  setIsInteractive(true)
  enableConfigs()
  clearOAuthTokenCache()
  getSecureStorage().delete()
  _setGlobalConfigCacheForTesting(null)
})

afterEach(async () => {
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

describe('teleport API end-to-end', () => {
  it('lists code sessions through the protected platform API and preserves workspace-backed repo identity', async () => {
    const server = await createMockOauthServer()
    liveServers.push(server)

    const workspaceSession = makeSession('session-workspace', {
      title: 'Workspace backed session',
      session_context: {
        sources: [
          {
            type: 'noumena_workspace',
            workspace_id: 'ws-1',
            repo: 'noumena/ncode',
            raw_workspace_name: 'ws.alpha',
            checkout_path: '/mlstore/src/noumena/ncode.dev',
            workspace_state: 'live',
            workspace_version: 221,
          },
        ],
        outcomes: null,
        cwd: '/workspace',
        custom_system_prompt: null,
        append_system_prompt: null,
        model: null,
      },
    })
    const gitSession = makeSession('session-git', {
      title: 'Git backed session',
      session_context: {
        sources: [
          {
            type: 'git_repository',
            url: 'https://github.com/noumena/platform',
            revision: 'develop',
          },
        ],
        outcomes: null,
        cwd: '/repo',
        custom_system_prompt: null,
        append_system_prompt: null,
        model: null,
      },
    })
    server.setSessions([workspaceSession, gitSession])

    await withMockOauthEnvironment(server, async () => {
      saveManagedTokens()

      await expect(fetchCodeSessionsFromSessionsAPI()).resolves.toEqual([
        {
          id: 'session-workspace',
          title: 'Workspace backed session',
          description: '',
          status: 'idle',
          repo: {
            name: 'ncode',
            owner: { login: 'noumena' },
            default_branch: undefined,
          },
          turns: [],
          created_at: '2026-04-22T00:00:00Z',
          updated_at: '2026-04-22T00:00:00Z',
        },
        {
          id: 'session-git',
          title: 'Git backed session',
          description: '',
          status: 'idle',
          repo: {
            name: 'platform',
            owner: { login: 'noumena' },
            default_branch: 'develop',
          },
          turns: [],
          created_at: '2026-04-22T00:00:00Z',
          updated_at: '2026-04-22T00:00:00Z',
        },
      ])

      const listRequest = server.requests.find(
        request => request.method === 'GET' && request.path === '/v1/sessions',
      )
      expect(listRequest).toBeTruthy()
      expect(listRequest?.headers.authorization).toBe('Bearer access-token')
      expect(listRequest?.headers['x-organization-uuid']).toBe('org-test')
    })
  })

  it('fetches a single protected session and preserves the workspace display contract', async () => {
    const server = await createMockOauthServer()
    liveServers.push(server)

    const session = makeSession('session-1', {
      title: 'Workspace session',
      session_context: {
        sources: [
          {
            type: 'noumena_workspace',
            workspace_id: 'ws-1',
            repo: 'noumena/ncode',
            raw_workspace_name: 'ws.alpha',
            checkout_path: '/mlstore/src/noumena/ncode.dev',
            workspace_state: 'live',
            workspace_version: 221,
          },
          {
            type: 'git_repository',
            url: 'https://github.com/noumena/ncode',
            revision: 'main',
          },
        ],
        outcomes: null,
        cwd: '/workspace',
        custom_system_prompt: null,
        append_system_prompt: null,
        model: null,
      },
    })
    server.setSessions([session])

    await withMockOauthEnvironment(server, async () => {
      saveManagedTokens()

      const fetched = await fetchSession('session-1')
      expect(fetched).toEqual(session)
      expect(getSessionRepoDisplay(fetched.session_context)).toBe(
        'noumena/ncode · ws.alpha @ v221 (live)',
      )

      const fetchRequest = server.requests.find(
        request =>
          request.method === 'GET' && request.path === '/v1/sessions/session-1',
      )
      expect(fetchRequest?.headers.authorization).toBe('Bearer access-token')
      expect(fetchRequest?.headers['x-organization-uuid']).toBe('org-test')
    })
  })

  it('translates missing sessions into a session-specific error', async () => {
    const server = await createMockOauthServer()
    liveServers.push(server)
    server.setSessions([])

    await withMockOauthEnvironment(server, async () => {
      saveManagedTokens()

      await expect(fetchSession('missing-session')).rejects.toThrow(
        'Session not found: missing-session',
      )
    })
  })

  it('fails closed when no managed OAuth token is present', async () => {
    const server = await createMockOauthServer()
    liveServers.push(server)

    await withMockOauthEnvironment(server, async () => {
      clearOAuthTokenCache()
      getSecureStorage().delete()

      await expect(fetchCodeSessionsFromSessionsAPI()).rejects.toThrow(
        MANAGED_REMOTE_AUTH_REQUIRED_MESSAGE,
      )
    })
  })

  it('refreshes an expired managed OAuth token before hitting the sessions API', async () => {
    const server = await createMockOauthServer()
    liveServers.push(server)
    server.setSessions([makeSession('session-refreshed')])

    await withMockOauthEnvironment(server, async () => {
      saveOAuthTokensIfNeeded({
        accessToken: 'expired-access-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() - 60_000,
        scopes: ['user:profile', 'user:inference'],
        subscriptionType: 'max',
        rateLimitTier: 'tier_1',
      })
      clearOAuthTokenCache()

      await expect(fetchCodeSessionsFromSessionsAPI()).resolves.toEqual([
        {
          id: 'session-refreshed',
          title: 'Session session-refreshed',
          description: '',
          status: 'idle',
          repo: {
            name: 'ncode',
            owner: { login: 'noumena' },
            default_branch: 'main',
          },
          turns: [],
          created_at: '2026-04-22T00:00:00Z',
          updated_at: '2026-04-22T00:00:00Z',
        },
      ])

      expect(server.refreshRequests).toHaveLength(1)

      const listRequest = server.requests.find(
        request => request.method === 'GET' && request.path === '/v1/sessions',
      )
      expect(listRequest).toBeTruthy()
      expect(listRequest?.headers.authorization).toBe(
        'Bearer refreshed-access-token',
      )
      expect(listRequest?.headers['x-organization-uuid']).toBe('org-test')
    })
  })

  it('translates unauthorized protected session fetches into an expired-session error', async () => {
    const server = await createMockOauthServer()
    liveServers.push(server)
    server.setSessions([makeSession('session-1')])

    await withMockOauthEnvironment(server, async () => {
      saveManagedTokens('stale-access-token')

      await expect(fetchSession('session-1')).rejects.toThrow(
        'Session expired. Please run /login to sign in again.',
      )
    })
  })
})
