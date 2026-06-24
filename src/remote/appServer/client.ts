import WS from 'ws'

import type { ClientNotification } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/ClientNotification'
import type { ClientRequest } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/ClientRequest'
import type { InitializeParams } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/InitializeParams'
import type { RequestId } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/RequestId'
import type { ServerNotification } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/ServerNotification'
import type { ServerRequest } from '../../../../codex/codex-rs/app-server-protocol/schema/typescript/ServerRequest'
import { jsonParse, jsonStringify } from '../../utils/slowOperations.js'

export type JsonRpcResult = unknown

export type JsonRpcErrorPayload = {
  code: number
  message: string
  data?: unknown
}

type JsonRpcResponse = {
  id: RequestId
  result: JsonRpcResult
}

type JsonRpcError = {
  id: RequestId
  error: JsonRpcErrorPayload
}

type JsonRpcMessage =
  | ClientRequest
  | ClientNotification
  | ServerRequest
  | ServerNotification
  | JsonRpcResponse
  | JsonRpcError

export type RemoteAppServerConnectArgs = {
  websocketUrl: string
  authToken?: string
  headers?: Record<string, string>
  clientName: string
  clientVersion: string
  experimentalApi?: boolean
  optOutNotificationMethods?: string[]
  channelCapacity?: number
  connectTimeoutMs?: number
  initializeTimeoutMs?: number
}

export function buildPlatformRemoteAppServerWebSocketUrl(
  platformBaseUrl: string,
  sessionId: string,
): string {
  const url = new URL(
    `/v1/sessions/${encodeURIComponent(sessionId)}/app-server/ws`,
    platformBaseUrl,
  )
  if (url.protocol === 'https:') {
    url.protocol = 'wss:'
  } else if (url.protocol === 'http:') {
    url.protocol = 'ws:'
  }
  return url.toString()
}

export type RemoteAppServerEvent =
  | { type: 'lagged'; skipped: number }
  | { type: 'server_notification'; notification: ServerNotification }
  | { type: 'server_request'; request: ServerRequest }
  | { type: 'disconnected'; message: string }

type PendingRequest = {
  resolve: (value: JsonRpcResult) => void
  reject: (error: Error) => void
}

const DEFAULT_CONNECT_TIMEOUT_MS = 10_000
const DEFAULT_INITIALIZE_TIMEOUT_MS = 10_000
const DEFAULT_CHANNEL_CAPACITY = 128
const INITIALIZE_REQUEST_ID = 'initialize'

function requestIdKey(id: RequestId): string {
  return `${typeof id}:${String(id)}`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  return isObject(value) && 'id' in value && 'result' in value
}

function isJsonRpcError(value: unknown): value is JsonRpcError {
  return (
    isObject(value) &&
    'id' in value &&
    isObject(value.error) &&
    typeof value.error.message === 'string' &&
    typeof value.error.code === 'number'
  )
}

function isJsonRpcRequest(value: unknown): value is ServerRequest {
  return isObject(value) && 'id' in value && typeof value.method === 'string'
}

function isJsonRpcNotification(value: unknown): value is ServerNotification {
  return isObject(value) && !('id' in value) && typeof value.method === 'string'
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  )
}

export function websocketUrlSupportsAuthToken(rawUrl: string): boolean {
  const url = new URL(rawUrl)
  if (url.protocol === 'wss:') {
    return true
  }
  return url.protocol === 'ws:' && isLoopbackHost(url.hostname)
}

function initializeParams(args: RemoteAppServerConnectArgs): InitializeParams {
  return {
    clientInfo: {
      name: args.clientName,
      title: null,
      version: args.clientVersion,
    },
    capabilities: {
      experimentalApi: args.experimentalApi ?? false,
      optOutNotificationMethods:
        args.optOutNotificationMethods &&
        args.optOutNotificationMethods.length > 0
          ? args.optOutNotificationMethods
          : null,
    },
  }
}

function appServerEventFromNotification(
  notification: ServerNotification,
): RemoteAppServerEvent {
  return { type: 'server_notification', notification }
}

export function appServerEventRequiresDelivery(
  event: RemoteAppServerEvent,
): boolean {
  if (event.type === 'disconnected') {
    return true
  }
  if (event.type !== 'server_notification') {
    return false
  }
  switch (event.notification.method) {
    case 'turn/completed':
    case 'item/completed':
    case 'item/agentMessage/delta':
    case 'item/plan/delta':
    case 'item/reasoning/summaryTextDelta':
    case 'item/reasoning/textDelta':
      return true
    default:
      return false
  }
}

class AsyncEventQueue<T> {
  private queue: T[] = []
  private waiters: Array<(value: T | undefined) => void> = []
  private closed = false

  constructor(private readonly capacity: number) {}

  tryPush(value: T): boolean {
    if (this.closed) {
      return false
    }
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter(value)
      return true
    }
    if (this.queue.length >= this.capacity) {
      return false
    }
    this.queue.push(value)
    return true
  }

  pushLossless(value: T): boolean {
    if (this.closed) {
      return false
    }
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter(value)
      return true
    }
    this.queue.push(value)
    return true
  }

  next(): Promise<T | undefined> {
    if (this.queue.length > 0) {
      return Promise.resolve(this.queue.shift())
    }
    if (this.closed) {
      return Promise.resolve(undefined)
    }
    return new Promise(resolve => this.waiters.push(resolve))
  }

  close(): void {
    if (this.closed) {
      return
    }
    this.closed = true
    for (const waiter of this.waiters.splice(0)) {
      waiter(undefined)
    }
  }
}

function timeoutPromise<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer)
    }
  })
}

export class RemoteAppServerClient {
  private ws: WS | null = null
  private readonly events: AsyncEventQueue<RemoteAppServerEvent>
  private readonly pendingRequests = new Map<string, PendingRequest>()
  private skippedEvents = 0
  private closed = false

  private constructor(
    private readonly args: Required<
      Pick<
        RemoteAppServerConnectArgs,
        | 'websocketUrl'
        | 'clientName'
        | 'clientVersion'
        | 'channelCapacity'
        | 'connectTimeoutMs'
        | 'initializeTimeoutMs'
      >
    > &
      Omit<
        RemoteAppServerConnectArgs,
        | 'websocketUrl'
        | 'clientName'
        | 'clientVersion'
        | 'channelCapacity'
        | 'connectTimeoutMs'
        | 'initializeTimeoutMs'
      >,
  ) {
    this.events = new AsyncEventQueue(args.channelCapacity)
  }

  static async connect(args: RemoteAppServerConnectArgs): Promise<RemoteAppServerClient> {
    if (args.authToken && !websocketUrlSupportsAuthToken(args.websocketUrl)) {
      throw new Error(
        `remote auth tokens require wss:// or loopback ws:// URLs; got ${args.websocketUrl}`,
      )
    }

    const client = new RemoteAppServerClient({
      ...args,
      channelCapacity: Math.max(1, args.channelCapacity ?? DEFAULT_CHANNEL_CAPACITY),
      connectTimeoutMs: args.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
      initializeTimeoutMs:
        args.initializeTimeoutMs ?? DEFAULT_INITIALIZE_TIMEOUT_MS,
    })
    await client.open()
    return client
  }

  async request<T = JsonRpcResult>(request: ClientRequest): Promise<T> {
    this.assertOpen()
    const key = requestIdKey(request.id)
    if (this.pendingRequests.has(key)) {
      throw new Error(`duplicate remote app-server request id ${String(request.id)}`)
    }

    const resultPromise = new Promise<JsonRpcResult>((resolve, reject) => {
      this.pendingRequests.set(key, { resolve, reject })
    })

    try {
      this.sendMessage(request)
      return (await resultPromise) as T
    } catch (error) {
      this.pendingRequests.delete(key)
      throw error
    }
  }

  async notify(notification: ClientNotification): Promise<void> {
    this.assertOpen()
    this.sendMessage(notification)
  }

  async resolveServerRequest(
    requestId: RequestId,
    result: JsonRpcResult,
  ): Promise<void> {
    this.assertOpen()
    this.sendMessage({ id: requestId, result })
  }

  async rejectServerRequest(
    requestId: RequestId,
    error: JsonRpcErrorPayload,
  ): Promise<void> {
    this.assertOpen()
    this.sendMessage({ id: requestId, error })
  }

  nextEvent(): Promise<RemoteAppServerEvent | undefined> {
    return this.events.next()
  }

  shutdown(): void {
    this.close('shutdown')
  }

  private async open(): Promise<void> {
    const headers: Record<string, string> = { ...(this.args.headers ?? {}) }
    if (this.args.authToken) {
      headers.Authorization = `Bearer ${this.args.authToken}`
    }
    const ws = new WS(this.args.websocketUrl, { headers })
    this.ws = ws

    await timeoutPromise(
      new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve())
        ws.once('error', reject)
        ws.once('close', () =>
          reject(
            new Error(
              `remote app server at ${this.args.websocketUrl} closed before open`,
            ),
          ),
        )
      }),
      this.args.connectTimeoutMs,
      `timed out connecting to remote app server at ${this.args.websocketUrl}`,
    )

    const pendingEvents = await this.initialize(ws)
    ws.on('message', data => this.handleRawMessage(String(data)))
    ws.on('close', (_code, reason) => {
      const text = reason?.toString() || 'connection closed'
      this.close(`remote app server at ${this.args.websocketUrl} disconnected: ${text}`)
    })
    ws.on('error', error => {
      this.close(
        `remote app server at ${this.args.websocketUrl} transport failed: ${error.message}`,
      )
    })
    ws.send(jsonStringify({ method: 'initialized' } satisfies ClientNotification))

    for (const event of pendingEvents) {
      this.enqueueEvent(event)
    }
  }

  private async initialize(ws: WS): Promise<RemoteAppServerEvent[]> {
    const pendingEvents: RemoteAppServerEvent[] = []
    const initializeRequest: ClientRequest = {
      method: 'initialize',
      id: INITIALIZE_REQUEST_ID,
      params: initializeParams(this.args),
    }

    ws.send(jsonStringify(initializeRequest))

    await timeoutPromise(
      new Promise<void>((resolve, reject) => {
        const onMessage = (data: WS.RawData) => {
          let message: unknown
          try {
            message = jsonParse(String(data))
          } catch (error) {
            cleanup()
            reject(
              new Error(
                `remote app server at ${this.args.websocketUrl} sent invalid initialize response: ${String(error)}`,
              ),
            )
            return
          }

          if (isJsonRpcResponse(message) && message.id === INITIALIZE_REQUEST_ID) {
            cleanup()
            resolve()
            return
          }
          if (isJsonRpcError(message) && message.id === INITIALIZE_REQUEST_ID) {
            cleanup()
            reject(
              new Error(
                `remote app server at ${this.args.websocketUrl} rejected initialize: ${message.error.message}`,
              ),
            )
            return
          }
          if (isJsonRpcNotification(message)) {
            pendingEvents.push(appServerEventFromNotification(message))
            return
          }
          if (isJsonRpcRequest(message)) {
            pendingEvents.push({ type: 'server_request', request: message })
          }
        }
        const onClose = () => {
          cleanup()
          reject(
            new Error(
              `remote app server at ${this.args.websocketUrl} closed during initialize`,
            ),
          )
        }
        const onError = (error: Error) => {
          cleanup()
          reject(
            new Error(
              `remote app server at ${this.args.websocketUrl} transport failed during initialize: ${error.message}`,
            ),
          )
        }
        const cleanup = () => {
          ws.off('message', onMessage)
          ws.off('close', onClose)
          ws.off('error', onError)
        }
        ws.on('message', onMessage)
        ws.once('close', onClose)
        ws.once('error', onError)
      }),
      this.args.initializeTimeoutMs,
      `timed out waiting for initialize response from ${this.args.websocketUrl}`,
    )

    return pendingEvents
  }

  private handleRawMessage(raw: string): void {
    let message: unknown
    try {
      message = jsonParse(raw)
    } catch (error) {
      this.close(
        `remote app server at ${this.args.websocketUrl} sent invalid JSON-RPC: ${String(error)}`,
      )
      return
    }

    if (isJsonRpcResponse(message)) {
      const pending = this.pendingRequests.get(requestIdKey(message.id))
      if (pending) {
        this.pendingRequests.delete(requestIdKey(message.id))
        pending.resolve(message.result)
      }
      return
    }
    if (isJsonRpcError(message)) {
      const pending = this.pendingRequests.get(requestIdKey(message.id))
      if (pending) {
        this.pendingRequests.delete(requestIdKey(message.id))
        pending.reject(new Error(message.error.message))
      }
      return
    }
    if (isJsonRpcNotification(message)) {
      this.enqueueEvent(appServerEventFromNotification(message))
      return
    }
    if (isJsonRpcRequest(message)) {
      this.enqueueEvent({ type: 'server_request', request: message })
    }
  }

  private enqueueEvent(event: RemoteAppServerEvent): void {
    if (this.skippedEvents > 0) {
      const lagged: RemoteAppServerEvent = {
        type: 'lagged',
        skipped: this.skippedEvents,
      }
      if (appServerEventRequiresDelivery(event)) {
        if (!this.events.pushLossless(lagged)) {
          this.close('remote app-server event consumer channel is closed')
          return
        }
        this.skippedEvents = 0
      } else if (this.events.tryPush(lagged)) {
        this.skippedEvents = 0
      } else {
        this.skippedEvents += 1
        void this.rejectIfServerRequestDropped(event)
        return
      }
    }

    if (appServerEventRequiresDelivery(event)) {
      if (!this.events.pushLossless(event)) {
        this.close('remote app-server event consumer channel is closed')
      }
      return
    }

    if (!this.events.tryPush(event)) {
      this.skippedEvents += 1
      void this.rejectIfServerRequestDropped(event)
    }
  }

  private async rejectIfServerRequestDropped(
    event: RemoteAppServerEvent,
  ): Promise<void> {
    if (event.type !== 'server_request') {
      return
    }
    try {
      await this.rejectServerRequest(event.request.id, {
        code: -32001,
        message: 'remote app-server event queue is full',
      })
    } catch {}
  }

  private sendMessage(message: JsonRpcMessage): void {
    this.assertOpen()
    this.ws?.send(jsonStringify(message))
  }

  private assertOpen(): void {
    if (this.closed || !this.ws || this.ws.readyState !== WS.OPEN) {
      throw new Error('remote app-server websocket is not open')
    }
  }

  private close(message: string): void {
    if (this.closed) {
      return
    }
    this.closed = true
    for (const pending of this.pendingRequests.values()) {
      pending.reject(new Error(message))
    }
    this.pendingRequests.clear()
    this.events.pushLossless({ type: 'disconnected', message })
    this.events.close()
    try {
      this.ws?.close()
    } catch {}
  }
}
