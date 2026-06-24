import { afterEach, describe, expect, test } from 'bun:test'
import { WebSocketServer, type WebSocket } from 'ws'
import type { AddressInfo } from 'node:net'

import {
  RemoteAppServerClient,
  appServerEventRequiresDelivery,
  buildPlatformRemoteAppServerWebSocketUrl,
  websocketUrlSupportsAuthToken,
  type RemoteAppServerEvent,
} from './client.js'

type FakeServer = {
  url: string
  close(): Promise<void>
}

const servers: FakeServer[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()))
})

function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = 3000,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out: ${label}`)), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

class FakePeer {
  private readonly queued: unknown[] = []
  private readonly waiters: Array<(value: unknown) => void> = []

  constructor(readonly ws: WebSocket) {
    ws.on('message', data => {
      const parsed = JSON.parse(String(data))
      const waiter = this.waiters.shift()
      if (waiter) {
        waiter(parsed)
      } else {
        this.queued.push(parsed)
      }
    })
  }

  next(label = 'fake peer message'): Promise<unknown> {
    const queued = this.queued.shift()
    if (queued !== undefined) {
      return Promise.resolve(queued)
    }
    return withTimeout(new Promise(resolve => this.waiters.push(resolve)), label)
  }

  send(value: unknown): void {
    this.ws.send(JSON.stringify(value))
  }
}

async function startFakeServer(
  handler: (peer: FakePeer, requestHeaders: Record<string, string | string[] | undefined>) => Promise<void>,
): Promise<FakeServer> {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  const address = wss.address() as AddressInfo
  const done = new Promise<void>((resolve, reject) => {
    wss.once('connection', (ws, request) => {
      handler(new FakePeer(ws), request.headers).then(resolve, reject)
    })
  })
  const server = {
    url: `ws://127.0.0.1:${address.port}`,
    async close() {
      await new Promise<void>(resolve => wss.close(() => resolve()))
      await done.catch(() => undefined)
    },
  }
  servers.push(server)
  return server
}

async function expectInitialize(peer: FakePeer): Promise<void> {
  const initialize = (await peer.next('initialize')) as {
    method?: string
    id?: unknown
    params?: { clientInfo?: { name?: string; version?: string } }
  }
  expect(initialize.method).toBe('initialize')
  expect(initialize.id).toBe('initialize')
  expect(initialize.params?.clientInfo?.name).toBe('ncode-test')
  peer.send({
    id: initialize.id,
    result: {
      userAgent: 'codex-test',
      codexHome: '/tmp/codex',
      platformFamily: 'unix',
      platformOs: 'linux',
    },
  })
  const initialized = (await peer.next('initialized')) as { method?: string }
  expect(initialized.method).toBe('initialized')
}

function testConnectArgs(url: string) {
  return {
    websocketUrl: url,
    clientName: 'ncode-test',
    clientVersion: '0.0.0-test',
    experimentalApi: true,
    channelCapacity: 4,
  }
}

describe('RemoteAppServerClient', () => {
  test('enforces auth-token transport policy', () => {
    expect(websocketUrlSupportsAuthToken('wss://example.com/app')).toBe(true)
    expect(websocketUrlSupportsAuthToken('ws://127.0.0.1:1234')).toBe(true)
    expect(websocketUrlSupportsAuthToken('ws://localhost:1234')).toBe(true)
    expect(websocketUrlSupportsAuthToken('ws://example.com:1234')).toBe(false)

    expect(
      RemoteAppServerClient.connect({
        ...testConnectArgs('ws://example.com:1234'),
        authToken: 'secret',
      }),
    ).rejects.toThrow('remote auth tokens require wss:// or loopback ws:// URLs')
  })

  test('connects with initialize handshake and bearer auth header', async () => {
    const server = await startFakeServer(async (peer, headers) => {
      expect(headers.authorization).toBe('Bearer remote-token')
      expect(headers['x-organization-uuid']).toBe('org-test')
      await expectInitialize(peer)
    })

    const client = await RemoteAppServerClient.connect({
      ...testConnectArgs(server.url),
      authToken: 'remote-token',
      headers: { 'x-organization-uuid': 'org-test' },
    })
    client.shutdown()
  })

  test('routes requests and typed responses by id', async () => {
    const server = await startFakeServer(async peer => {
      await expectInitialize(peer)
      const request = (await peer.next('model/list')) as {
        method?: string
        id?: number
      }
      expect(request.method).toBe('model/list')
      peer.send({
        id: request.id,
        result: { data: [{ id: 'gpt-test' }], hasMore: false },
      })
    })

    const client = await RemoteAppServerClient.connect(testConnectArgs(server.url))
    const response = await client.request<{ data: Array<{ id: string }> }>({
      method: 'model/list',
      id: 1,
      params: { cursor: null, limit: null, includeHidden: true },
    })
    expect(response.data[0]?.id).toBe('gpt-test')
    client.shutdown()
  })

  test('delivers notifications and resolves server requests', async () => {
    const server = await startFakeServer(async peer => {
      await expectInitialize(peer)
      peer.send({
        method: 'item/agentMessage/delta',
        params: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          itemId: 'item-1',
          delta: 'hello',
        },
      })
      peer.send({
        method: 'item/commandExecution/requestApproval',
        id: 7,
        params: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          itemId: 'cmd-1',
          approvalId: null,
          reason: null,
          networkApprovalContext: null,
          command: 'pwd',
          cwd: '/tmp',
          commandActions: null,
          additionalPermissions: null,
          proposedExecpolicyAmendment: null,
          proposedNetworkPolicyAmendments: null,
          availableDecisions: null,
        },
      })
      const response = (await peer.next('server request response')) as {
        id?: number
        result?: { decision?: string }
      }
      expect(response.id).toBe(7)
      expect(response.result?.decision).toBe('approved')
    })

    const client = await RemoteAppServerClient.connect(testConnectArgs(server.url))
    const notification = await client.nextEvent()
    expect(notification).toMatchObject({
      type: 'server_notification',
      notification: {
        method: 'item/agentMessage/delta',
        params: { delta: 'hello' },
      },
    })
    const request = await client.nextEvent()
    expect(request).toMatchObject({
      type: 'server_request',
      request: {
        method: 'item/commandExecution/requestApproval',
        id: 7,
      },
    })
    await client.resolveServerRequest(7, { decision: 'approved' })
    client.shutdown()
  })

  test('classifies lossless app-server events', () => {
    const lossless: RemoteAppServerEvent = {
      type: 'server_notification',
      notification: {
        method: 'item/agentMessage/delta',
        params: {
          threadId: 'thread',
          turnId: 'turn',
          itemId: 'item',
          delta: 'x',
        },
      },
    }
    expect(appServerEventRequiresDelivery(lossless)).toBe(true)
    expect(appServerEventRequiresDelivery({ type: 'lagged', skipped: 1 })).toBe(
      false,
    )
  })

  test('builds platform app-server websocket URLs', () => {
    expect(
      buildPlatformRemoteAppServerWebSocketUrl(
        'https://api.dev.noumena.test',
        'session-1',
      ),
    ).toBe('wss://api.dev.noumena.test/v1/sessions/session-1/app-server/ws')
    expect(
      buildPlatformRemoteAppServerWebSocketUrl(
        'http://127.0.0.1:8080',
        'session 1',
      ),
    ).toBe('ws://127.0.0.1:8080/v1/sessions/session%201/app-server/ws')
  })
})
