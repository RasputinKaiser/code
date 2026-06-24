import { describe, expect, test } from 'bun:test'

import type { ClientRequest } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/ClientRequest'
import type { ServerRequest } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/ServerRequest'
import type { RemoteAppServerEvent } from './client.js'
import {
  NOUMENA_MANAGED_CODEX_MODEL_PROVIDER,
  RemoteAppServerSession,
  buildNoumenaManagedCodexConfig,
  buildRemoteAppServerManagedEnvironmentVariables,
  type RemoteAppServerRequestClient,
} from './remoteAppServerSession.js'

class FakeAppServerClient implements RemoteAppServerRequestClient {
  requests: ClientRequest[] = []
  resolved: Array<{ id: string | number; result: unknown }> = []
  rejected: Array<{ id: string | number; error: unknown }> = []
  private events: Array<RemoteAppServerEvent | undefined> = []

  constructor(events: RemoteAppServerEvent[] = []) {
    this.events = [...events, undefined]
  }

  async request<T>(request: ClientRequest): Promise<T> {
    this.requests.push(request)
    if (request.method === 'account/login/start') {
      return { type: 'chatgptAuthTokens' } as T
    }
    if (request.method === 'thread/start') {
      return {
        thread: {
          id: 'thread-1',
          path: null,
          preview: '',
          createdAt: 0,
          updatedAt: 0,
          status: 'idle',
          modelProvider: NOUMENA_MANAGED_CODEX_MODEL_PROVIDER,
          source: 'appServer',
          ephemeral: true,
        },
        model: 'gpt-oss-20b',
        modelProvider: NOUMENA_MANAGED_CODEX_MODEL_PROVIDER,
        serviceTier: null,
        cwd: '/repo',
        approvalPolicy: 'on-request',
        approvalsReviewer: 'user',
        sandbox: { mode: 'workspaceWrite' },
        reasoningEffort: null,
      } as T
    }
    if (request.method === 'turn/start') {
      return {
        turn: {
          id: 'turn-1',
          items: [],
          status: 'inProgress',
          error: null,
        },
      } as T
    }
    return {} as T
  }

  async resolveServerRequest(id: string | number, result: unknown): Promise<void> {
    this.resolved.push({ id, result })
  }

  async rejectServerRequest(id: string | number, error: unknown): Promise<void> {
    this.rejected.push({ id, error })
  }

  async nextEvent(): Promise<RemoteAppServerEvent | undefined> {
    return this.events.shift()
  }

  shutdown(): void {}
}

describe('remoteAppServerSession', () => {
  test('builds Noumena managed Codex config', () => {
    const config = buildNoumenaManagedCodexConfig({
      model: 'gpt-oss-20b',
      platformBaseUrl: 'https://api.dev.noumena.test/',
      codexModelBaseUrl: 'https://code.dev.noumena.test/',
    })

    expect(config).toContain('model_provider = "noumena_managed"')
    expect(config).toContain('chatgpt_base_url = "https://api.dev.noumena.test/backend-api"')
    expect(config).toContain('approval_policy = "never"')
    expect(config).toContain('sandbox_mode = "danger-full-access"')
    expect(config).toContain('web_search = "live"')
    expect(config).toContain('[model_providers.noumena_managed]')
    expect(config).toContain('base_url = "https://code.dev.noumena.test/v1"')
    expect(config).toContain('wire_api = "responses"')
    expect(config).toContain('requires_openai_auth = true')
    expect(config).not.toContain('supports_websockets')
    expect(config).not.toContain('OPENAI_API_KEY')
  })

  test('builds managed app-server runtime env vars', () => {
    expect(
      buildRemoteAppServerManagedEnvironmentVariables({
        codexModel: 'gpt-oss-20b',
        platformBaseUrl: 'https://api.dev.noumena.test',
        codexModelBaseUrl: 'https://code.dev.noumena.test',
        codexHome: '/home/ncode/.codex',
      }),
    ).toEqual({
      NCODE_REMOTE_RUNTIME_KIND: 'codex_app_server',
      NCODE_REMOTE_RUNTIME_PROVIDER_MODE: 'noumena_managed',
      NCODE_REMOTE_RUNTIME_TOKEN_TRANSPORT: 'legacy_oauth_env',
      NCODE_CODEX_MODEL: 'gpt-oss-20b',
      NCODE_CODEX_PLATFORM_BASE_URL: 'https://api.dev.noumena.test',
      NCODE_CODEX_MODEL_BASE_URL: 'https://code.dev.noumena.test',
      CODEX_HOME: '/home/ncode/.codex',
    })
  })

  test('logs in once, starts a thread, and sends turns', async () => {
    const client = new FakeAppServerClient()
    const session = new RemoteAppServerSession({
      client,
      cwd: '/repo',
      model: 'gpt-oss-20b',
      managedAuth: {
        accessToken: 'access-token',
        accountId: 'workspace-1',
        planType: 'pro',
      },
    })

    await session.sendMessage('first')
    await session.sendMessage('second')

    expect(client.requests.map(request => request.method)).toEqual([
      'account/login/start',
      'thread/start',
      'turn/start',
      'turn/start',
    ])
    expect(client.requests[0]).toMatchObject({
      method: 'account/login/start',
      params: {
        type: 'chatgptAuthTokens',
        accessToken: 'access-token',
        chatgptAccountId: 'workspace-1',
        chatgptPlanType: 'pro',
      },
    })
    expect(client.requests[1]).toMatchObject({
      method: 'thread/start',
      params: {
        model: 'gpt-oss-20b',
        modelProvider: 'noumena_managed',
        cwd: '/repo',
        config: { web_search: 'live' },
        serviceName: 'ncode_remote_app_server',
      },
    })
  })

  test('services app-server token refresh requests', async () => {
    const refreshRequest: ServerRequest = {
      method: 'account/chatgptAuthTokens/refresh',
      id: 7,
      params: {
        reason: 'unauthorized',
        previousAccountId: 'workspace-1',
      },
    }
    const client = new FakeAppServerClient([
      { type: 'server_request', request: refreshRequest },
    ])
    const session = new RemoteAppServerSession({
      client,
      cwd: '/repo',
      model: 'gpt-oss-20b',
      managedAuth: {
        accessToken: 'old-token',
        accountId: 'workspace-1',
        planType: 'pro',
        async refreshTokens() {
          return {
            accessToken: 'new-token',
            accountId: 'workspace-1',
            planType: 'pro',
          }
        },
      },
    })

    session.startEventPump()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(client.resolved).toEqual([
      {
        id: 7,
        result: {
          accessToken: 'new-token',
          chatgptAccountId: 'workspace-1',
          chatgptPlanType: 'pro',
        },
      },
    ])
    expect(client.rejected).toEqual([])
  })

  test('forwards completed agent-message text when no delta was streamed', async () => {
    const client = new FakeAppServerClient([
      {
        type: 'server_notification',
        notification: {
          method: 'item/completed',
          params: {
            threadId: 'thread-1',
            turnId: 'turn-1',
            item: {
              type: 'agentMessage',
              id: 'agent-1',
              text: 'pong',
              phase: null,
              memoryCitation: null,
            },
          },
        },
      },
      {
        type: 'server_notification',
        notification: {
          method: 'turn/completed',
          params: {
            threadId: 'thread-1',
            turn: {
              id: 'turn-1',
              items: [],
              status: 'completed',
              error: null,
            },
          },
        },
      },
    ])
    const session = new RemoteAppServerSession({
      client,
      cwd: '/repo',
      model: 'gpt-oss-20b',
      managedAuth: {
        accessToken: 'access-token',
        accountId: 'workspace-1',
      },
    })
    const deltas: string[] = []
    let completed = 0

    session.startEventPump({
      onAssistantDelta: delta => deltas.push(delta),
      onTurnCompleted: () => {
        completed += 1
      },
    })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(deltas).toEqual(['pong'])
    expect(completed).toBe(1)
  })
})
