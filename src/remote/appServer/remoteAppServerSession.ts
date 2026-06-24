import type { ClientRequest } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/ClientRequest'
import type { RequestId } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/RequestId'
import type { ServerRequest } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/ServerRequest'
import type { ChatgptAuthTokensRefreshResponse } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/v2/ChatgptAuthTokensRefreshResponse'
import type { LoginAccountResponse } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/v2/LoginAccountResponse'
import type { ThreadStartParams } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/v2/ThreadStartParams'
import type { ThreadStartResponse } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/v2/ThreadStartResponse'
import type { TurnStartParams } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/v2/TurnStartParams'
import type { TurnStartResponse } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/v2/TurnStartResponse'
import type { RemoteMessageContent } from '../../utils/teleport/api.js'
import type {
  JsonRpcErrorPayload,
  JsonRpcResult,
  RemoteAppServerEvent,
} from './client.js'
import { RemoteAppServerClient } from './client.js'
import { remoteMessageContentToCodexUserInput } from './remoteAppServerBYOKSession.js'
import {
  REMOTE_RUNTIME_MATRIX,
  remoteRuntimeEnvironmentVariables,
} from '../runtimeMatrix.js'

export const NOUMENA_MANAGED_CODEX_MODEL_PROVIDER = 'noumena_managed'
export type RemoteAppServerManagedTokens = {
  accessToken: string
  accountId: string
  planType?: string | null
}

export type RemoteAppServerManagedAuth = RemoteAppServerManagedTokens & {
  refreshTokens?: () => Promise<RemoteAppServerManagedTokens>
}

export type RemoteAppServerRequestClient = Pick<
  RemoteAppServerClient,
  | 'request'
  | 'resolveServerRequest'
  | 'rejectServerRequest'
  | 'nextEvent'
  | 'shutdown'
>

export type RemoteAppServerSessionOptions = {
  client: RemoteAppServerRequestClient
  cwd: string
  model: string
  managedAuth: RemoteAppServerManagedAuth
  modelProvider?: string
  serviceName?: string
  config?: ThreadStartParams['config']
  approvalPolicy?: ThreadStartParams['approvalPolicy']
  sandbox?: ThreadStartParams['sandbox']
  experimentalRawEvents?: boolean
  persistExtendedHistory?: boolean
}

export type RemoteAppServerSessionState = {
  loggedIn: boolean
  threadId: string | null
  activeTurnId: string | null
}

export type RemoteAppServerSessionCallbacks = {
  onEvent?: (event: RemoteAppServerEvent) => void
  onAssistantDelta?: (delta: string, event: RemoteAppServerEvent) => void
  onServerRequest?: (request: ServerRequest) => void
  onTurnCompleted?: (event: RemoteAppServerEvent) => void
  onDisconnected?: (message: string) => void
}

export function buildNoumenaManagedCodexConfig(params: {
  model: string
  platformBaseUrl: string
  codexModelBaseUrl?: string
  modelProvider?: string
}): string {
  const provider = params.modelProvider ?? NOUMENA_MANAGED_CODEX_MODEL_PROVIDER
  const base = params.platformBaseUrl.replace(/\/+$/, '')
  const modelBase = (params.codexModelBaseUrl ?? params.platformBaseUrl).replace(/\/+$/, '')
  return [
    `model = ${JSON.stringify(params.model)}`,
    `model_provider = ${JSON.stringify(provider)}`,
    `chatgpt_base_url = ${JSON.stringify(`${base}/backend-api`)}`,
    'approval_policy = "never"',
    'sandbox_mode = "danger-full-access"',
    'web_search = "live"',
    '',
    `[model_providers.${provider}]`,
    'name = "Noumena Managed"',
    `base_url = ${JSON.stringify(`${modelBase}/v1`)}`,
    'wire_api = "responses"',
    'requires_openai_auth = true',
    '',
  ].join('\n')
}

export function buildRemoteAppServerManagedEnvironmentVariables(params: {
  codexModel?: string
  platformBaseUrl?: string
  codexModelBaseUrl?: string
  codexHome?: string
} = {}): Record<string, string> {
  return {
    ...remoteRuntimeEnvironmentVariables(
      REMOTE_RUNTIME_MATRIX.remoteAppServerSession.runtime,
    ),
    ...(params.codexModel ? { NCODE_CODEX_MODEL: params.codexModel } : {}),
    ...(params.platformBaseUrl
      ? { NCODE_CODEX_PLATFORM_BASE_URL: params.platformBaseUrl }
      : {}),
    ...(params.codexModelBaseUrl
      ? { NCODE_CODEX_MODEL_BASE_URL: params.codexModelBaseUrl }
      : {}),
    ...(params.codexHome ? { CODEX_HOME: params.codexHome } : {}),
  }
}

export class RemoteAppServerSession {
  private nextRequestId = 1
  private loggedIn = false
  private threadId: string | null = null
  private activeTurnId: string | null = null
  private eventPumpRunning = false
  private readonly agentMessageDeltaItemIds = new Set<string>()

  constructor(private readonly options: RemoteAppServerSessionOptions) {}

  state(): RemoteAppServerSessionState {
    return {
      loggedIn: this.loggedIn,
      threadId: this.threadId,
      activeTurnId: this.activeTurnId,
    }
  }

  startEventPump(callbacks: RemoteAppServerSessionCallbacks = {}): void {
    if (this.eventPumpRunning) {
      return
    }
    this.eventPumpRunning = true
    void this.runEventPump(callbacks)
  }

  async login(): Promise<void> {
    if (this.loggedIn) {
      return
    }
    await this.loginWithTokens(this.options.managedAuth)
  }

  async sendMessage(content: RemoteMessageContent): Promise<TurnStartResponse> {
    const threadId = await this.ensureThread()
    const response = await this.options.client.request<TurnStartResponse>({
      method: 'turn/start',
      id: this.nextId(),
      params: {
        threadId,
        input: remoteMessageContentToCodexUserInput(content),
      } satisfies TurnStartParams,
    })
    this.activeTurnId = response.turn.id
    return response
  }

  async cancelRequest(): Promise<void> {
    if (!this.threadId || !this.activeTurnId) {
      return
    }
    await this.options.client.request({
      method: 'turn/interrupt',
      id: this.nextId(),
      params: {
        threadId: this.threadId,
        turnId: this.activeTurnId,
      },
    } as ClientRequest)
  }

  async resolveServerRequest(
    requestId: RequestId,
    result: JsonRpcResult,
  ): Promise<void> {
    await this.options.client.resolveServerRequest(requestId, result)
  }

  async rejectServerRequest(
    requestId: RequestId,
    error: JsonRpcErrorPayload,
  ): Promise<void> {
    await this.options.client.rejectServerRequest(requestId, error)
  }

  shutdown(): void {
    this.options.client.shutdown()
  }

  private async loginWithTokens(
    tokens: RemoteAppServerManagedTokens,
  ): Promise<void> {
    await this.options.client.request<LoginAccountResponse>({
      method: 'account/login/start',
      id: this.nextId(),
      params: {
        type: 'chatgptAuthTokens',
        accessToken: tokens.accessToken,
        chatgptAccountId: tokens.accountId,
        chatgptPlanType: tokens.planType ?? null,
      },
    } as ClientRequest)
    this.loggedIn = true
  }

  private async ensureThread(): Promise<string> {
    await this.login()
    if (this.threadId) {
      return this.threadId
    }
    const params: ThreadStartParams = {
      model: this.options.model,
      modelProvider:
        this.options.modelProvider ?? NOUMENA_MANAGED_CODEX_MODEL_PROVIDER,
      cwd: this.options.cwd,
      config: this.options.config ?? { web_search: 'live' },
      approvalPolicy: this.options.approvalPolicy ?? null,
      sandbox: this.options.sandbox ?? null,
      serviceName: this.options.serviceName ?? 'ncode_remote_app_server',
      experimentalRawEvents: this.options.experimentalRawEvents ?? false,
      persistExtendedHistory: this.options.persistExtendedHistory ?? true,
    }
    const response = await this.options.client.request<ThreadStartResponse>({
      method: 'thread/start',
      id: this.nextId(),
      params,
    })
    this.threadId = response.thread.id
    return response.thread.id
  }

  private async handleAuthRefresh(request: ServerRequest): Promise<boolean> {
    if (request.method !== 'account/chatgptAuthTokens/refresh') {
      return false
    }
    const refreshTokens = this.options.managedAuth.refreshTokens
    if (!refreshTokens) {
      await this.rejectServerRequest(request.id, {
        code: -32603,
        message: 'managed app-server auth refresh is unavailable',
      })
      return true
    }

    try {
      const refreshed = await refreshTokens()
      const result: ChatgptAuthTokensRefreshResponse = {
        accessToken: refreshed.accessToken,
        chatgptAccountId: refreshed.accountId,
        chatgptPlanType: refreshed.planType ?? null,
      }
      await this.resolveServerRequest(request.id, result)
    } catch (error) {
      await this.rejectServerRequest(request.id, {
        code: -32603,
        message: error instanceof Error ? error.message : String(error),
      })
    }
    return true
  }

  private async runEventPump(
    callbacks: RemoteAppServerSessionCallbacks,
  ): Promise<void> {
    while (true) {
      const event = await this.options.client.nextEvent()
      if (!event) {
        return
      }
      callbacks.onEvent?.(event)
      if (event.type === 'server_request') {
        if (await this.handleAuthRefresh(event.request)) {
          continue
        }
        callbacks.onServerRequest?.(event.request)
        continue
      }
      if (event.type === 'disconnected') {
        callbacks.onDisconnected?.(event.message)
        return
      }
      if (event.type !== 'server_notification') {
        continue
      }
      if (event.notification.method === 'item/agentMessage/delta') {
        this.agentMessageDeltaItemIds.add(event.notification.params.itemId)
        callbacks.onAssistantDelta?.(event.notification.params.delta, event)
        continue
      }
      if (event.notification.method === 'item/completed') {
        const item = event.notification.params.item
        if (
          item.type === 'agentMessage' &&
          !this.agentMessageDeltaItemIds.has(item.id) &&
          item.text
        ) {
          callbacks.onAssistantDelta?.(item.text, event)
        }
        continue
      }
      if (event.notification.method === 'turn/completed') {
        this.activeTurnId = null
        callbacks.onTurnCompleted?.(event)
      }
    }
  }

  private nextId(): number {
    return this.nextRequestId++
  }
}
