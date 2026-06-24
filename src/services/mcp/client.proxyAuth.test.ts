import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { getAuthRuntime } from '../../auth/runtime/AuthRuntime.js'

let resolveSessionCalls: Array<{ allowRefresh?: boolean; forceRefresh?: boolean }> = []
let sessionQueue: Array<{
  principalSource: string
  sessionState: string
  accessToken: string | null
}> = []

const authRuntime = getAuthRuntime() as ReturnType<typeof getAuthRuntime> & {
  resolveSession: (options?: {
    allowRefresh?: boolean
    forceRefresh?: boolean
  }) => Promise<unknown>
  getCurrentManagedSession: () => unknown
}
const originalResolveSession = authRuntime.resolveSession.bind(authRuntime)
const originalGetCurrentManagedSession =
  authRuntime.getCurrentManagedSession.bind(authRuntime)

const { createClaudeAiProxyFetch } = await import('./client.ts')

beforeEach(() => {
  resolveSessionCalls = []
  sessionQueue = []
  authRuntime.resolveSession = async (options?: {
    allowRefresh?: boolean
    forceRefresh?: boolean
  }) => {
    resolveSessionCalls.push(options ?? {})
    const next = sessionQueue.shift()
    if (!next) {
      throw new Error('No mocked session available')
    }
    return next
  }
  authRuntime.getCurrentManagedSession = () => {
    const current = sessionQueue[0]
    if (!current || current.principalSource !== 'managed_oauth') {
      return null
    }
    return {
      ...current,
      canRefresh: true,
    }
  }
})

afterEach(() => {
  authRuntime.resolveSession = originalResolveSession
  authRuntime.getCurrentManagedSession = originalGetCurrentManagedSession
})

describe('createClaudeAiProxyFetch', () => {
  it('uses canonical managed-session truth for the proxy bearer', async () => {
    sessionQueue = [
      {
        principalSource: 'managed_oauth',
        sessionState: 'usable',
        accessToken: 'managed-token',
      },
    ]

    const fetchWithAuth = createClaudeAiProxyFetch(async (_url, init) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe('Bearer managed-token')
      return new Response('ok', { status: 200 })
    })

    const response = await fetchWithAuth('https://proxy.example.test', {})
    expect(response.status).toBe(200)
    expect(resolveSessionCalls).toEqual([{ allowRefresh: true }])
  })

  it('force-refreshes through AuthRuntime and retries once on 401 when the managed token changes', async () => {
    sessionQueue = [
      {
        principalSource: 'managed_oauth',
        sessionState: 'usable',
        accessToken: 'stale-token',
      },
      {
        principalSource: 'managed_oauth',
        sessionState: 'usable',
        accessToken: 'fresh-token',
      },
      {
        principalSource: 'managed_oauth',
        sessionState: 'usable',
        accessToken: 'fresh-token',
      },
    ]

    const seenAuthHeaders: string[] = []
    const fetchWithAuth = createClaudeAiProxyFetch(async (_url, init) => {
      const headers = new Headers(init?.headers)
      seenAuthHeaders.push(headers.get('Authorization') ?? '')
      if (seenAuthHeaders.length === 1) {
        return new Response('unauthorized', { status: 401 })
      }
      return new Response('ok', { status: 200 })
    })

    const response = await fetchWithAuth('https://proxy.example.test', {})
    expect(response.status).toBe(200)
    expect(seenAuthHeaders).toEqual([
      'Bearer stale-token',
      'Bearer fresh-token',
    ])
    expect(resolveSessionCalls).toEqual([
      { allowRefresh: true },
      { allowRefresh: true, forceRefresh: true },
      { allowRefresh: true },
    ])
  })
})
