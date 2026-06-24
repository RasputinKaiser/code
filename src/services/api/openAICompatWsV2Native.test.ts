import { describe, expect, it } from 'bun:test'
import { WebSocketServer } from 'ws'
import {
  candidateNativeBindingModuleIdsForTesting,
  createNativeOpenAICompatWsV2Transport,
  loadNativeBindingForTesting,
  type NativeWsV2Binding,
} from './openAICompatWsV2Native.js'

function makeBinding(messages: string[]) {
  const calls: Array<Record<string, unknown>> = []
  return {
    calls,
    binding: {
      wsV2NativeAvailable: () => true,
      wsV2Connect: async (url: string, headersJson?: string | null, clientName?: string | null) => {
        calls.push({ method: 'connect', url, headersJson, clientName })
        return 'session-1'
      },
      wsV2Start: async (sessionId: string, requestId: string, payloadJson: string) => {
        calls.push({ method: 'start', sessionId, requestId, payload: JSON.parse(payloadJson) })
      },
      wsV2Next: async () => messages.shift() ?? null,
      wsV2Cancel: async (sessionId: string, requestId: string) => {
        calls.push({ method: 'cancel', sessionId, requestId })
      },
      wsV2Close: async (sessionId: string) => {
        calls.push({ method: 'close', sessionId })
      },
    },
  }
}

function callsByMethod(calls: Array<Record<string, unknown>>, method: string) {
  return calls.filter(call => call.method === method)
}

function makeDelta(content: string, id?: string): string {
  return JSON.stringify({
    method: 'chat.completions.delta',
    params: {
      ...(id ? { id } : {}),
      data: JSON.stringify({ choices: [{ delta: { content } }] }),
    },
  })
}

function makeCompleted(id?: string): string {
  return JSON.stringify({
    method: 'chat.completions.completed',
    params: id ? { id } : {},
  })
}

async function readResponseText(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
  }
  text += decoder.decode()
  return text
}

describe('createNativeOpenAICompatWsV2Transport', () => {
  it('searches both source and bundled native binding locations', () => {
    const candidates = candidateNativeBindingModuleIdsForTesting()

    expect(candidates).toContain('../../../native/openai-compat-ws-v2-napi')
    expect(candidates).toContain('../native/openai-compat-ws-v2-napi')
  })

  it('converts WS v2 delta and completion notifications into SSE frames', async () => {
    const delta = JSON.stringify({ id: 'chunk-1', choices: [{ delta: { content: 'ok' } }] })
    const { binding, calls } = makeBinding([
      JSON.stringify({ id: 'req-accepted' }),
      JSON.stringify({ method: 'chat.completions.delta', params: { data: delta } }),
      JSON.stringify({ method: 'chat.completions.completed', params: {} }),
    ])
    const transport = createNativeOpenAICompatWsV2Transport(binding)
    expect(transport).toBeTruthy()

    const response = await transport!({
      url: 'http://example.test/v1/chat/completions/ws/v2',
      headers: new Headers({ authorization: 'Bearer token' }),
      request: { model: 'test-model', stream: true },
    })
    const text = await readResponseText(response)

    expect(text).toContain(`data: ${delta}\n\n`)
    expect(text).toContain('data: [DONE]\n\n')
    expect(calls[0]).toMatchObject({
      method: 'connect',
      url: 'ws://example.test/v1/chat/completions/ws/v2',
      clientName: 'ncode-openai-compat',
    })
    expect(JSON.parse(String(calls[0]?.headersJson)).authorization).toBe('Bearer token')
    expect(calls.some(call => call.method === 'start')).toBe(true)
    expect(calls.at(-1)).toMatchObject({ method: 'close', sessionId: 'session-1' })
    expect(callsByMethod(calls, 'start')).toHaveLength(1)
    expect(callsByMethod(calls, 'close')).toHaveLength(1)
  })

  it('sends cancel and closes when the caller aborts the stream', async () => {
    const { binding, calls } = makeBinding([
      JSON.stringify({ method: 'chat.completions.delta', params: { data: JSON.stringify({ choices: [{ delta: { content: 'partial' } }] }) } }),
    ])
    const transport = createNativeOpenAICompatWsV2Transport(binding)
    const controller = new AbortController()
    const response = await transport!({
      url: 'http://example.test/v1/chat/completions/ws/v2',
      headers: new Headers(),
      request: { model: 'test-model', stream: true },
      signal: controller.signal,
    })
    const reader = response.body!.getReader()
    await reader.read()
    controller.abort()
    await reader.cancel().catch(() => {})

    expect(calls.some(call => call.method === 'cancel')).toBe(true)
    expect(calls.some(call => call.method === 'close')).toBe(true)
  })

  it('orders abort cleanup as cancel before close', async () => {
    const messages = [
      JSON.stringify({ method: 'chat.completions.delta', params: { data: JSON.stringify({ choices: [{ delta: { content: 'partial' } }] }) } }),
    ]
    const { binding: baseBinding, calls } = makeBinding(messages)
    const binding = {
      ...baseBinding,
      wsV2Cancel: async (sessionId: string, requestId: string) => {
        await Bun.sleep(20)
        calls.push({ method: 'cancel', sessionId, requestId })
      },
      wsV2Close: async (sessionId: string) => {
        calls.push({ method: 'close', sessionId })
      },
    }
    const transport = createNativeOpenAICompatWsV2Transport(binding)
    const controller = new AbortController()
    const response = await transport!({
      url: 'http://example.test/v1/chat/completions/ws/v2',
      headers: new Headers(),
      request: { model: 'test-model', stream: true },
      signal: controller.signal,
    })
    const reader = response.body!.getReader()
    await reader.read()

    controller.abort()
    await waitFor(
      () => callsByMethod(calls, 'close').length === 1,
      'abort cleanup close',
    )

    const cancelIndex = calls.findIndex(call => call.method === 'cancel')
    const closeIndex = calls.findIndex(call => call.method === 'close')
    expect(cancelIndex).toBeGreaterThanOrEqual(0)
    expect(closeIndex).toBeGreaterThan(cancelIndex)
    await reader.cancel().catch(() => {})
  })

  it('does not drain native messages before the response body is read', async () => {
    const messages = [
      JSON.stringify({ id: 'req-accepted' }),
      ...Array.from({ length: 200 }, (_, i) =>
        JSON.stringify({
          method: 'chat.completions.delta',
          params: {
            data: JSON.stringify({ choices: [{ delta: { content: `chunk-${i}` } }] }),
          },
        }),
      ),
      JSON.stringify({ method: 'chat.completions.completed', params: {} }),
    ]
    const { binding: baseBinding, calls } = makeBinding(messages)
    let nextCalls = 0
    const binding = {
      ...baseBinding,
      wsV2Next: async (sessionId: string) => {
        nextCalls += 1
        calls.push({ method: 'next', sessionId, nextCalls })
        return messages.shift() ?? null
      },
    }
    const transport = createNativeOpenAICompatWsV2Transport(binding)

    const response = await transport!({
      url: 'http://example.test/v1/chat/completions/ws/v2',
      headers: new Headers(),
      request: { model: 'test-model', stream: true },
    })
    await Bun.sleep(50)

    expect(nextCalls).toBe(0)

    const text = await readResponseText(response)
    expect(nextCalls).toBeGreaterThan(0)
    expect(text).toContain('chunk-0')
    expect(text).toContain('data: [DONE]\n\n')
  })

  it('does not continue draining native messages behind a slow response reader', async () => {
    const messages = [
      JSON.stringify({ id: 'req-accepted' }),
      ...Array.from({ length: 200 }, (_, i) =>
        JSON.stringify({
          method: 'chat.completions.delta',
          params: {
            data: JSON.stringify({ choices: [{ delta: { content: `chunk-${i}` } }] }),
          },
        }),
      ),
      JSON.stringify({ method: 'chat.completions.completed', params: {} }),
    ]
    const { binding: baseBinding, calls } = makeBinding(messages)
    let nextCalls = 0
    const binding = {
      ...baseBinding,
      wsV2Next: async (sessionId: string) => {
        nextCalls += 1
        calls.push({ method: 'next', sessionId, nextCalls })
        return messages.shift() ?? null
      },
    }
    const transport = createNativeOpenAICompatWsV2Transport(binding)
    const response = await transport!({
      url: 'http://example.test/v1/chat/completions/ws/v2',
      headers: new Headers(),
      request: { model: 'test-model', stream: true },
    })
    const reader = response.body!.getReader()

    const first = await reader.read()
    await Bun.sleep(50)

    expect(new TextDecoder().decode(first.value)).toContain('chunk-0')
    expect(nextCalls).toBe(2)

    await reader.cancel().catch(() => {})
  })

  it('pulls one emitted SSE frame per reader demand across a large stream', async () => {
    const messages = [
      JSON.stringify({ id: 'req-accepted' }),
      ...Array.from({ length: 50 }, (_, i) => makeDelta(`chunk-${i}`)),
      makeCompleted(),
    ]
    const { binding: baseBinding, calls } = makeBinding(messages)
    let nextCalls = 0
    const binding = {
      ...baseBinding,
      wsV2Next: async (sessionId: string) => {
        nextCalls += 1
        calls.push({ method: 'next', sessionId, nextCalls })
        return messages.shift() ?? null
      },
    }
    const response = await createNativeOpenAICompatWsV2Transport(binding)!({
      url: 'http://example.test/v1/chat/completions/ws/v2',
      headers: new Headers(),
      request: { model: 'test-model', stream: true },
    })
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    for (let i = 0; i < 10; i += 1) {
      const { value, done } = await reader.read()
      expect(done).toBe(false)
      expect(decoder.decode(value)).toContain(`chunk-${i}`)
      expect(nextCalls).toBe(i + 2)
      await Bun.sleep(5)
      expect(nextCalls).toBe(i + 2)
    }

    await reader.cancel().catch(() => {})
    expect(callsByMethod(calls, 'start')).toHaveLength(1)
    expect(callsByMethod(calls, 'close')).toHaveLength(1)
  })

  it('ignores cross-request notifications without leaking them to the SSE stream', async () => {
    const { binding, calls } = makeBinding([
      JSON.stringify({ id: 'req-accepted' }),
      makeDelta('wrong-request', 'other-request'),
      makeCompleted('other-request'),
      makeDelta('current-request'),
      makeCompleted(),
    ])

    const response = await createNativeOpenAICompatWsV2Transport(binding)!({
      url: 'http://example.test/v1/chat/completions/ws/v2',
      headers: new Headers(),
      request: { model: 'test-model', stream: true },
    })
    const text = await readResponseText(response)

    expect(text).toContain('current-request')
    expect(text).not.toContain('wrong-request')
    expect(text).toContain('data: [DONE]\n\n')
    expect(callsByMethod(calls, 'close')).toHaveLength(1)
  })

  it('propagates WS v2 stream errors and closes the native session', async () => {
    const { binding, calls } = makeBinding([
      JSON.stringify({ id: 'req-accepted' }),
      JSON.stringify({
        method: 'chat.completions.error',
        params: { error: { message: 'backend failed' } },
      }),
    ])

    const response = await createNativeOpenAICompatWsV2Transport(binding)!({
      url: 'http://example.test/v1/chat/completions/ws/v2',
      headers: new Headers(),
      request: { model: 'test-model', stream: true },
    })

    await expect(readResponseText(response)).rejects.toThrow('backend failed')
    expect(callsByMethod(calls, 'close')).toHaveLength(1)
  })

  it('propagates rejected start acknowledgements and closes the native session', async () => {
    const messages: string[] = []
    const { binding: baseBinding, calls } = makeBinding(messages)
    const binding = {
      ...baseBinding,
      wsV2Start: async (sessionId: string, requestId: string, payloadJson: string) => {
        calls.push({ method: 'start', sessionId, requestId, payload: JSON.parse(payloadJson) })
        messages.push(
          JSON.stringify({
            id: requestId,
            error: { message: 'request rejected' },
          }),
        )
      },
    }

    const response = await createNativeOpenAICompatWsV2Transport(binding)!({
      url: 'http://example.test/v1/chat/completions/ws/v2',
      headers: new Headers(),
      request: { model: 'test-model', stream: true },
    })

    await expect(readResponseText(response)).rejects.toThrow('request rejected')
    expect(callsByMethod(calls, 'close')).toHaveLength(1)
  })

  it('treats native close before completion as an error and closes once', async () => {
    const { binding, calls } = makeBinding([
      JSON.stringify({ id: 'req-accepted' }),
      makeDelta('partial'),
    ])

    const response = await createNativeOpenAICompatWsV2Transport(binding)!({
      url: 'http://example.test/v1/chat/completions/ws/v2',
      headers: new Headers(),
      request: { model: 'test-model', stream: true },
    })

    await expect(readResponseText(response)).rejects.toThrow(
      'WS v2 stream closed before completion',
    )
    expect(callsByMethod(calls, 'close')).toHaveLength(1)
  })

  it('does not start or drain native messages when cancelled before the first read', async () => {
    const { binding, calls } = makeBinding([
      JSON.stringify({ id: 'req-accepted' }),
      makeDelta('should-not-read'),
      makeCompleted(),
    ])
    const response = await createNativeOpenAICompatWsV2Transport(binding)!({
      url: 'http://example.test/v1/chat/completions/ws/v2',
      headers: new Headers(),
      request: { model: 'test-model', stream: true },
    })

    await response.body!.cancel().catch(() => {})

    expect(callsByMethod(calls, 'start')).toHaveLength(0)
    expect(callsByMethod(calls, 'cancel')).toHaveLength(1)
    expect(callsByMethod(calls, 'close')).toHaveLength(1)
  })

  it('does not start or drain native messages when the caller aborts before the first read', async () => {
    const { binding, calls } = makeBinding([
      JSON.stringify({ id: 'req-accepted' }),
      makeDelta('should-not-read'),
      makeCompleted(),
    ])
    const controller = new AbortController()
    const response = await createNativeOpenAICompatWsV2Transport(binding)!({
      url: 'http://example.test/v1/chat/completions/ws/v2',
      headers: new Headers(),
      request: { model: 'test-model', stream: true },
      signal: controller.signal,
    })

    controller.abort()
    await Bun.sleep(10)
    await response.body!.cancel().catch(() => {})

    expect(callsByMethod(calls, 'start')).toHaveLength(0)
    expect(callsByMethod(calls, 'cancel')).toHaveLength(1)
    expect(callsByMethod(calls, 'close')).toHaveLength(1)
  })
})

function waitFor(
  predicate: () => boolean,
  label: string,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve()
        return
      }
      if (Date.now() >= deadline) {
        reject(new Error(`timed out waiting for ${label}`))
        return
      }
      setTimeout(tick, 10)
    }
    tick()
  })
}

function createNativeWsV2LoopbackServer(options?: {
  readonly keepRequestsOpen?: boolean
  readonly oversizedPayloadBytes?: number
  readonly closeAfterInitialize?: boolean
  readonly delayedDeltaMs?: number
}) {
  const requestIds: string[] = []
  const closedSockets = new Set<ServerWebSocket<unknown>>()
  const closeEvents: Array<{ code?: number; reason: string }> = []
  let pingCount = 0
  const server = Bun.serve({
    port: 0,
    fetch(req, server) {
      if (server.upgrade(req)) {
        return undefined
      }
      return new Response('not found', { status: 404 })
    },
    websocket: {
      message(ws, raw) {
        const message = JSON.parse(String(raw)) as {
          id?: string
          method?: string
          params?: unknown
        }
        if (message.method === 'initialize') {
          ws.send(JSON.stringify({ id: message.id, result: { ok: true } }))
          if (options?.closeAfterInitialize) {
            ws.close()
          }
          return
        }
        if (message.method === 'chat.completions.start') {
          requestIds.push(String(message.id))
          ws.send(JSON.stringify({ id: message.id, result: { accepted: true } }))
          if (options?.oversizedPayloadBytes) {
            ws.send(
              JSON.stringify({
                method: 'chat.completions.delta',
                params: {
                  id: message.id,
                  data: 'x'.repeat(options.oversizedPayloadBytes),
                },
              }),
            )
          }
          if (options?.delayedDeltaMs !== undefined) {
            setTimeout(() => {
              ws.send(
                JSON.stringify({
                  method: 'chat.completions.delta',
                  params: {
                    id: message.id,
                    data: JSON.stringify({ choices: [{ delta: { content: 'delayed' } }] }),
                  },
                }),
              )
            }, options.delayedDeltaMs)
          }
          if (!options?.keepRequestsOpen) {
            ws.send(
              JSON.stringify({
                method: 'chat.completions.completed',
                params: { id: message.id },
              }),
            )
          }
          return
        }
        if (message.method === 'chat.completions.cancel') {
          ws.send(
            JSON.stringify({
              method: 'chat.completions.completed',
              params: { id: (message.params as { id?: string })?.id },
            }),
          )
        }
      },
      close(ws, code, reason) {
        closedSockets.add(ws)
        closeEvents.push({ code, reason: String(reason ?? '') })
      },
      ping() {
        pingCount += 1
      },
    },
  })

  return {
    url: `http://127.0.0.1:${server.port}/v1/chat/completions/ws/v2`,
    requestIds,
    closedSockets,
    closeEvents,
    pingCount: () => pingCount,
    stop() {
      server.stop(true)
    },
  }
}

async function createNodeWsV2LoopbackServer(options?: {
  readonly delayedDeltaMs?: number
}) {
  const requestIds: string[] = []
  let pingCount = 0
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await new Promise<void>(resolve => server.once('listening', resolve))
  server.on('connection', ws => {
    ws.on('ping', () => {
      pingCount += 1
    })
    ws.on('message', raw => {
      const message = JSON.parse(String(raw)) as {
        id?: string
        method?: string
        params?: unknown
      }
      if (message.method === 'initialize') {
        ws.send(JSON.stringify({ id: message.id, result: { ok: true } }))
        return
      }
      if (message.method === 'chat.completions.start') {
        requestIds.push(String(message.id))
        ws.send(JSON.stringify({ id: message.id, result: { accepted: true } }))
        if (options?.delayedDeltaMs !== undefined) {
          setTimeout(() => {
            ws.send(
              JSON.stringify({
                method: 'chat.completions.delta',
                params: {
                  id: message.id,
                  data: JSON.stringify({ choices: [{ delta: { content: 'delayed' } }] }),
                },
              }),
            )
          }, options.delayedDeltaMs)
        }
      }
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('failed to bind node websocket loopback server')
  }
  return {
    url: `http://127.0.0.1:${address.port}/v1/chat/completions/ws/v2`,
    requestIds,
    pingCount: () => pingCount,
    stop() {
      return new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) reject(error)
          else resolve()
        })
      })
    },
  }
}

describe('native openai compat ws v2 lifecycle', () => {
  const binding = loadNativeBindingForTesting()
  const nativeIt = binding ? it : it.skip

  nativeIt('wakes a pending wsV2Next when the session is closed', async () => {
    const nativeBinding = binding as NativeWsV2Binding
    const server = createNativeWsV2LoopbackServer({ keepRequestsOpen: true })
    try {
      const sessionId = await nativeBinding.wsV2Connect!(
        server.url,
        '{}',
        'ncode-test',
      )
      await nativeBinding.wsV2Start!(
        sessionId,
        'request-close-pending-next',
        JSON.stringify({ model: 'test', messages: [], stream: true }),
      )
      await waitFor(() => server.requestIds.length > 0, 'loopback start')
      const accepted = await nativeBinding.wsV2Next!(sessionId)
      expect(accepted).toContain('request-close-pending-next')

      const pendingNext = nativeBinding.wsV2Next!(sessionId)
      await Bun.sleep(50)
      await nativeBinding.wsV2Close!(sessionId)

      const result = await Promise.race([
        pendingNext,
        Bun.sleep(1000).then(() => 'timeout' as const),
      ])

      expect(result).not.toBe('timeout')
      expect(result).toBeNull()
    } finally {
      server.stop()
    }
  })

  nativeIt('survives repeated connect/start/next/close cycles', async () => {
    const nativeBinding = binding as NativeWsV2Binding
    const server = createNativeWsV2LoopbackServer()
    try {
      for (let i = 0; i < 25; i += 1) {
        const sessionId = await nativeBinding.wsV2Connect!(
          server.url,
          '{}',
          'ncode-test',
        )
        await nativeBinding.wsV2Start!(
          sessionId,
          `request-${i}`,
          JSON.stringify({ model: 'test', messages: [], stream: true }),
        )
        let sawCompletion = false
        for (let next = 0; next < 4; next += 1) {
          const raw = await nativeBinding.wsV2Next!(sessionId)
          if (!raw) break
          const message = JSON.parse(raw) as { method?: string }
          if (message.method === 'chat.completions.completed') {
            sawCompletion = true
            break
          }
        }
        expect(sawCompletion).toBe(true)
        await nativeBinding.wsV2Close!(sessionId)
      }
    } finally {
      server.stop()
    }
  })

  nativeIt('sends websocket close frames instead of resetting close handshakes', async () => {
    const nativeBinding = binding as NativeWsV2Binding
    const server = createNativeWsV2LoopbackServer()
    try {
      for (let i = 0; i < 10; i += 1) {
        const sessionId = await nativeBinding.wsV2Connect!(
          server.url,
          '{}',
          'ncode-test',
        )
        await nativeBinding.wsV2Close!(sessionId)
        await waitFor(
          () => server.closeEvents.length >= i + 1,
          `loopback close ${i}`,
        )
      }

      expect(server.closeEvents.map(event => event.code)).not.toContain(1006)
    } finally {
      server.stop()
    }
  })

  nativeIt('receives messages larger than tungstenite default frame size', async () => {
    const nativeBinding = binding as NativeWsV2Binding
    const server = createNativeWsV2LoopbackServer({
      oversizedPayloadBytes: 17 * 1024 * 1024,
      keepRequestsOpen: true,
    })
    try {
      const sessionId = await nativeBinding.wsV2Connect!(
        server.url,
        '{}',
        'ncode-test',
      )
      await nativeBinding.wsV2Start!(
        sessionId,
        'request-large-frame',
        JSON.stringify({ model: 'test', messages: [], stream: true }),
      )

      await nativeBinding.wsV2Next!(sessionId)
      const largeFrame = await nativeBinding.wsV2Next!(sessionId)
      expect(largeFrame?.length).toBeGreaterThan(16 * 1024 * 1024)
      await nativeBinding.wsV2Close!(sessionId)
    } finally {
      server.stop()
    }
  })

  nativeIt('propagates peer disconnects to pending native reads', async () => {
    const nativeBinding = binding as NativeWsV2Binding
    const server = createNativeWsV2LoopbackServer({ closeAfterInitialize: true })
    try {
      const sessionId = await nativeBinding.wsV2Connect!(
        server.url,
        '{}',
        'ncode-test',
      )

      await expect(nativeBinding.wsV2Next!(sessionId)).rejects.toThrow(
        'websocket closed',
      )
    } finally {
      server.stop()
    }
  })

  nativeIt('sends proactive pings while waiting for long-running responses', async () => {
    const nativeBinding = binding as NativeWsV2Binding
    const server = await createNodeWsV2LoopbackServer({
      delayedDeltaMs: 80,
    })
    try {
      const sessionId = await nativeBinding.wsV2Connect!(
        server.url,
        '{}',
        'ncode-test',
        JSON.stringify({
          pingIntervalMs: 20,
          pingTimeoutMs: 200,
          readTimeoutMs: 1000,
        }),
      )
      await nativeBinding.wsV2Start!(
        sessionId,
        'request-idle-ping',
        JSON.stringify({ model: 'test', messages: [], stream: true }),
      )

      await nativeBinding.wsV2Next!(sessionId)
      await waitFor(() => server.pingCount() > 0, 'loopback ping')
      const delayed = await nativeBinding.wsV2Next!(sessionId)
      expect(delayed).toContain('delayed')
      await nativeBinding.wsV2Close!(sessionId)
    } finally {
      await server.stop()
    }
  })

  nativeIt('times out pending native reads with an explicit error', async () => {
    const nativeBinding = binding as NativeWsV2Binding
    const server = createNativeWsV2LoopbackServer({ keepRequestsOpen: true })
    try {
      const sessionId = await nativeBinding.wsV2Connect!(
        server.url,
        '{}',
        'ncode-test',
        JSON.stringify({ readTimeoutMs: 50 }),
      )
      await nativeBinding.wsV2Start!(
        sessionId,
        'request-read-timeout',
        JSON.stringify({ model: 'test', messages: [], stream: true }),
      )

      await nativeBinding.wsV2Next!(sessionId)
      await expect(nativeBinding.wsV2Next!(sessionId)).rejects.toThrow(
        'websocket read timed out after 50ms',
      )
    } finally {
      server.stop()
    }
  })

  nativeIt('survives repeated transport aborts while native reads are pending', async () => {
    const nativeBinding = binding as NativeWsV2Binding
    const transport = createNativeOpenAICompatWsV2Transport(nativeBinding)
    expect(transport).toBeTruthy()
    const server = createNativeWsV2LoopbackServer({ keepRequestsOpen: true })
    try {
      for (let i = 0; i < 25; i += 1) {
        const previousRequestCount = server.requestIds.length
        const controller = new AbortController()
        const response = await transport!({
          url: server.url,
          headers: new Headers(),
          request: { model: 'test-model', messages: [], stream: true },
          signal: controller.signal,
        })
        const reader = response.body!.getReader()
        const pendingRead = reader.read()
        await waitFor(
          () => server.requestIds.length > previousRequestCount,
          `loopback start ${i}`,
        )
        await Bun.sleep(10)
        controller.abort()
        await pendingRead.catch(() => {})
        await reader.cancel().catch(() => {})
      }
    } finally {
      server.stop()
    }
  })
})
