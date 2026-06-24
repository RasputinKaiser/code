import type { ClientRequest } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/ClientRequest'
import type { RequestId } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/RequestId'
import type { ServerRequest } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/ServerRequest'
import type { ThreadStartParams } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/v2/ThreadStartParams'
import type { ThreadStartResponse } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/v2/ThreadStartResponse'
import type { TurnStartParams } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/v2/TurnStartParams'
import type { TurnStartResponse } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/v2/TurnStartResponse'
import type { UserInput } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/v2/UserInput'
import type { RemoteMessageContent } from '../../utils/teleport/api.js'
import type {
  JsonRpcErrorPayload,
  JsonRpcResult,
  RemoteAppServerEvent,
} from './client.js'
import { RemoteAppServerClient } from './client.js'
import {
  REMOTE_RUNTIME_MATRIX,
  remoteRuntimeEnvironmentVariables,
} from '../runtimeMatrix.js'

export const OPENAI_BYOK_CODEX_MODEL_PROVIDER = 'openai_byok'
export const OPENAI_BYOK_ENV_KEY = 'OPENAI_API_KEY'

export type RemoteAppServerRequestClient = Pick<
  RemoteAppServerClient,
  | 'request'
  | 'resolveServerRequest'
  | 'rejectServerRequest'
  | 'nextEvent'
  | 'shutdown'
>

export type RemoteAppServerBYOKSessionOptions = {
  client: RemoteAppServerRequestClient
  cwd: string
  model: string
  modelProvider?: string
  serviceName?: string
  approvalPolicy?: ThreadStartParams['approvalPolicy']
  sandbox?: ThreadStartParams['sandbox']
  experimentalRawEvents?: boolean
  persistExtendedHistory?: boolean
}

export type RemoteAppServerBYOKSessionState = {
  threadId: string | null
  activeTurnId: string | null
}

export type RemoteAppServerBYOKSessionCallbacks = {
  onEvent?: (event: RemoteAppServerEvent) => void
  onAssistantDelta?: (delta: string, event: RemoteAppServerEvent) => void
  onServerRequest?: (request: ServerRequest) => void
  onTurnCompleted?: (event: RemoteAppServerEvent) => void
  onDisconnected?: (message: string) => void
}

export function buildOpenAIByokCodexConfig(params: {
  model: string
  baseUrl?: string
  modelProvider?: string
}): string {
  const provider = params.modelProvider ?? OPENAI_BYOK_CODEX_MODEL_PROVIDER
  const baseUrl = params.baseUrl ?? 'https://api.openai.com/v1'
  return [
    `model = ${JSON.stringify(params.model)}`,
    `model_provider = ${JSON.stringify(provider)}`,
    'approval_policy = "never"',
    'sandbox_mode = "danger-full-access"',
    'web_search = "live"',
    '',
    `[model_providers.${provider}]`,
    'name = "OpenAI BYOK"',
    `base_url = ${JSON.stringify(baseUrl)}`,
    `env_key = ${JSON.stringify(OPENAI_BYOK_ENV_KEY)}`,
    'wire_api = "responses"',
    'requires_openai_auth = false',
    '',
  ].join('\n')
}

export function buildRemoteAppServerBYOKEnvironmentVariables(params: {
  openAIAPIKey: string
  codexHome?: string
}): Record<string, string> {
  return {
    ...remoteRuntimeEnvironmentVariables(
      REMOTE_RUNTIME_MATRIX.remoteAppServerBYOKSession.runtime,
    ),
    OPENAI_API_KEY: params.openAIAPIKey,
    ...(params.codexHome ? { CODEX_HOME: params.codexHome } : {}),
  }
}

export function remoteMessageContentToCodexUserInput(
  content: RemoteMessageContent,
): UserInput[] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content, text_elements: [] }]
  }

  return content.map(block => {
    if (block.type === 'text' && typeof block.text === 'string') {
      return {
        type: 'text',
        text: block.text,
        text_elements: [],
      }
    }
    if (block.type === 'image' && typeof block.url === 'string') {
      return { type: 'image', url: block.url }
    }
    throw new Error(
      `remote app-server BYOK sessions do not support content block type ${JSON.stringify(block.type)}`,
    )
  })
}

export class RemoteAppServerBYOKSession {
  private nextRequestId = 1
  private threadId: string | null = null
  private activeTurnId: string | null = null
  private eventPumpRunning = false
  private readonly agentMessageDeltaItemIds = new Set<string>()

  constructor(private readonly options: RemoteAppServerBYOKSessionOptions) {}

  state(): RemoteAppServerBYOKSessionState {
    return {
      threadId: this.threadId,
      activeTurnId: this.activeTurnId,
    }
  }

  startEventPump(callbacks: RemoteAppServerBYOKSessionCallbacks = {}): void {
    if (this.eventPumpRunning) {
      return
    }
    this.eventPumpRunning = true
    void this.runEventPump(callbacks)
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

  private async ensureThread(): Promise<string> {
    if (this.threadId) {
      return this.threadId
    }
    const params: ThreadStartParams = {
      model: this.options.model,
      modelProvider:
        this.options.modelProvider ?? OPENAI_BYOK_CODEX_MODEL_PROVIDER,
      cwd: this.options.cwd,
      approvalPolicy: this.options.approvalPolicy ?? null,
      sandbox: this.options.sandbox ?? null,
      serviceName: this.options.serviceName ?? 'ncode_remote_app_server_byok',
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

  private async runEventPump(
    callbacks: RemoteAppServerBYOKSessionCallbacks,
  ): Promise<void> {
    while (true) {
      const event = await this.options.client.nextEvent()
      if (!event) {
        return
      }
      callbacks.onEvent?.(event)
      if (event.type === 'server_request') {
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
