import { describe, expect, test } from 'bun:test'

import type { ClientRequest } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/ClientRequest'
import type { ServerRequest } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/ServerRequest'
import {
  OPENAI_BYOK_CODEX_MODEL_PROVIDER,
  buildOpenAIByokCodexConfig,
  buildRemoteAppServerBYOKEnvironmentVariables,
  remoteMessageContentToCodexUserInput,
  RemoteAppServerBYOKSession,
  type RemoteAppServerRequestClient,
} from './remoteAppServerBYOKSession.js'
import type { RemoteAppServerEvent } from './client.js'

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
    if (request.method === 'thread/start') {
      return {
        thread: {
          id: 'thread-1',
          path: null,
          preview: '',
          createdAt: 0,
          updatedAt: 0,
          status: 'idle',
          modelProvider: OPENAI_BYOK_CODEX_MODEL_PROVIDER,
          source: 'appServer',
          ephemeral: true,
        },
        model: 'gpt-5.1-codex',
        modelProvider: OPENAI_BYOK_CODEX_MODEL_PROVIDER,
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

describe('remoteAppServerBYOKSession', () => {
  test('builds Codex OpenAI BYOK config without persisted auth', () => {
    const config = buildOpenAIByokCodexConfig({
      model: 'gpt-5.1-codex',
    })

    expect(config).toContain('model_provider = "openai_byok"')
    expect(config).toContain('approval_policy = "never"')
    expect(config).toContain('sandbox_mode = "danger-full-access"')
    expect(config).toContain('web_search = "live"')
    expect(config).toContain('[model_providers.openai_byok]')
    expect(config).toContain('env_key = "OPENAI_API_KEY"')
    expect(config).toContain('requires_openai_auth = false')
    expect(config).not.toContain('auth.json')
    expect(config).not.toContain('CODEX_API_KEY')
  })

  test('builds isolated remote OpenAI BYOK runtime env vars', () => {
    expect(
      buildRemoteAppServerBYOKEnvironmentVariables({
        openAIAPIKey: 'sk-test',
        codexHome: '/home/ncode/.codex',
      }),
    ).toEqual({
      NCODE_REMOTE_RUNTIME_KIND: 'codex_app_server',
      NCODE_REMOTE_RUNTIME_PROVIDER_MODE: 'byok_openai',
      NCODE_REMOTE_RUNTIME_TOKEN_TRANSPORT: 'static_api_key_env',
      OPENAI_API_KEY: 'sk-test',
      CODEX_HOME: '/home/ncode/.codex',
    })
  })

  test('converts code remote message content into Codex user input', () => {
    expect(remoteMessageContentToCodexUserInput('hello')).toEqual([
      { type: 'text', text: 'hello', text_elements: [] },
    ])
    expect(
      remoteMessageContentToCodexUserInput([{ type: 'text', text: 'hello' }]),
    ).toEqual([{ type: 'text', text: 'hello', text_elements: [] }])
  })

  test('starts a Codex thread once and sends turns through app-server', async () => {
    const client = new FakeAppServerClient()
    const session = new RemoteAppServerBYOKSession({
      client,
      cwd: '/repo',
      model: 'gpt-5.1-codex',
    })

    await session.sendMessage('first')
    await session.sendMessage('second')

    expect(client.requests.map(request => request.method)).toEqual([
      'thread/start',
      'turn/start',
      'turn/start',
    ])
    expect(client.requests[0]).toMatchObject({
      method: 'thread/start',
      params: {
        model: 'gpt-5.1-codex',
        modelProvider: 'openai_byok',
        cwd: '/repo',
        serviceName: 'ncode_remote_app_server_byok',
        experimentalRawEvents: false,
        persistExtendedHistory: true,
      },
    })
    expect(client.requests[1]).toMatchObject({
      method: 'turn/start',
      params: {
        threadId: 'thread-1',
        input: [{ type: 'text', text: 'first', text_elements: [] }],
      },
    })
    expect(client.requests[2]).toMatchObject({
      method: 'turn/start',
      params: {
        threadId: 'thread-1',
        input: [{ type: 'text', text: 'second', text_elements: [] }],
      },
    })
  })

  test('event pump forwards assistant deltas and server requests', async () => {
    const serverRequest: ServerRequest = {
      method: 'item/commandExecution/requestApproval',
      id: 9,
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'cmd-1',
        approvalId: null,
        reason: null,
        networkApprovalContext: null,
        command: 'pwd',
        cwd: '/repo',
        commandActions: null,
        additionalPermissions: null,
        proposedExecpolicyAmendment: null,
        proposedNetworkPolicyAmendments: null,
        availableDecisions: null,
      },
    }
    const client = new FakeAppServerClient([
      {
        type: 'server_notification',
        notification: {
          method: 'item/agentMessage/delta',
          params: {
            threadId: 'thread-1',
            turnId: 'turn-1',
            itemId: 'item-1',
            delta: 'hello',
          },
        },
      },
      { type: 'server_request', request: serverRequest },
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
    const session = new RemoteAppServerBYOKSession({
      client,
      cwd: '/repo',
      model: 'gpt-5.1-codex',
    })
    const deltas: string[] = []
    const requests: ServerRequest[] = []
    let completed = 0

    session.startEventPump({
      onAssistantDelta: delta => deltas.push(delta),
      onServerRequest: request => requests.push(request),
      onTurnCompleted: () => {
        completed += 1
      },
    })

    await new Promise(resolve => setTimeout(resolve, 0))

    expect(deltas).toEqual(['hello'])
    expect(requests).toEqual([serverRequest])
    expect(completed).toBe(1)
  })
})
