import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { logForDebugging } from '../../utils/debug.js'

const require = createRequire(import.meta.url)
const NATIVE_PACKAGE_RELATIVE_PATH = join('native', 'openai-compat-ws-v2-napi')

export type NativeWsV2Binding = {
  wsV2NativeAvailable?: () => boolean
  wsV2Connect?: (
    url: string,
    headersJson?: string | null,
    clientName?: string | null,
    optionsJson?: string | null,
  ) => Promise<string>
  wsV2Start?: (
    sessionId: string,
    requestId: string,
    payloadJson: string,
  ) => Promise<void>
  wsV2Next?: (sessionId: string) => Promise<string | null>
  wsV2Cancel?: (sessionId: string, requestId: string) => Promise<void>
  wsV2Close?: (sessionId: string) => Promise<void>
}

export type OpenAICompatWsV2TransportArgs = {
  url: string
  headers: Headers
  request: unknown
  signal?: AbortSignal
}

export type OpenAICompatWsV2Transport = (
  args: OpenAICompatWsV2TransportArgs,
) => Promise<Response>

function candidateNativeBindingModuleIds(): string[] {
  const candidates = new Set<string>()

  // Source layout: src/services/api/openAICompatWsV2Native.ts -> code/native.
  candidates.add('../../../native/openai-compat-ws-v2-napi')
  // Built JS layout: dist/cli.js -> code/native.
  candidates.add('../native/openai-compat-ws-v2-napi')

  try {
    const moduleDir = dirname(fileURLToPath(import.meta.url))
    candidates.add(resolve(moduleDir, '..', NATIVE_PACKAGE_RELATIVE_PATH))
    candidates.add(resolve(moduleDir, '..', '..', '..', NATIVE_PACKAGE_RELATIVE_PATH))
  } catch {
    // Ignore URL resolution failures; other candidates may still work.
  }

  const invokedPath = process.argv[1]
  if (invokedPath) {
    const invokedDir = dirname(resolve(invokedPath))
    candidates.add(resolve(invokedDir, '..', NATIVE_PACKAGE_RELATIVE_PATH))
  }

  return [...candidates]
}

function validateNativeBinding(binding: NativeWsV2Binding): NativeWsV2Binding | null {
  if (binding.wsV2NativeAvailable?.() !== true) {
    return null
  }
  if (
    typeof binding.wsV2Connect !== 'function' ||
    typeof binding.wsV2Start !== 'function' ||
    typeof binding.wsV2Next !== 'function' ||
    typeof binding.wsV2Cancel !== 'function' ||
    typeof binding.wsV2Close !== 'function'
  ) {
    return null
  }
  return binding
}

function loadNativeBinding(): NativeWsV2Binding | null {
  for (const moduleId of candidateNativeBindingModuleIds()) {
    try {
      const binding = require(moduleId) as NativeWsV2Binding
      const validBinding = validateNativeBinding(binding)
      if (validBinding) {
        logForDebugging(`[OpenAICompatWsV2] native binding loaded from ${moduleId}`)
        return validBinding
      }
    } catch {
      // Try the next source/bundled/native layout candidate.
    }
  }
  logForDebugging('[OpenAICompatWsV2] native binding unavailable')
  return null
}

export function loadNativeBindingForTesting(): NativeWsV2Binding | null {
  return loadNativeBinding()
}

export function candidateNativeBindingModuleIdsForTesting(): string[] {
  return candidateNativeBindingModuleIds()
}

function wsUrlForChatCompletions(baseUrl: string): string {
  const url = new URL('/v1/chat/completions/ws/v2', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function headersJson(headers: Headers): string {
  const values: Record<string, string> = {}
  for (const [key, value] of headers.entries()) {
    values[key] = value
  }
  return JSON.stringify(values)
}

function encodeSseFrame(data: string): Uint8Array {
  return new TextEncoder().encode(`data: ${data}\n\n`)
}

function isRequestNotification(message: Record<string, unknown>, requestId: string): boolean {
  const params = message.params
  if (!params || typeof params !== 'object') {
    return false
  }
  const id = (params as { id?: unknown }).id
  return id === undefined || id === null || id === requestId
}

export function createNativeOpenAICompatWsV2Transport(
  binding: NativeWsV2Binding | null = loadNativeBinding(),
): OpenAICompatWsV2Transport | null {
  if (!binding?.wsV2Connect || !binding.wsV2Start || !binding.wsV2Next || !binding.wsV2Cancel || !binding.wsV2Close) {
    return null
  }

  return async ({ url, headers, request, signal }) => {
    const requestId = `ncode-ws-v2-${randomUUID()}`
    const wsUrl = wsUrlForChatCompletions(url)
    logForDebugging(`[OpenAICompatWsV2] connecting request ${requestId} to ${new URL(wsUrl).pathname}`)
    const sessionId = await binding.wsV2Connect(
      wsUrl,
      headersJson(headers),
      'ncode-openai-compat',
      null,
    )

    let closed = false
    const close = async () => {
      if (closed) return
      closed = true
      await binding.wsV2Close?.(sessionId).catch(() => {})
    }

    let started = false
    let startPromise: Promise<void> | null = null
    let streamClosed = false
    let abortHandler: (() => void) | null = null
    let cancelled = false

    const removeAbortHandler = () => {
      if (abortHandler) {
        signal?.removeEventListener('abort', abortHandler)
        abortHandler = null
      }
    }

    const safeCloseController = (
      controller: ReadableStreamDefaultController<Uint8Array>,
    ) => {
      if (streamClosed) return
      streamClosed = true
      try {
        controller.close()
      } catch {
        // The consumer may have cancelled while a native read was pending.
      }
    }

    const ensureStarted = () => {
      if (!startPromise) {
        startPromise = (async () => {
          if (started) return
          started = true
          logForDebugging(`[OpenAICompatWsV2] starting request ${requestId}`)
          await binding.wsV2Start?.(sessionId, requestId, JSON.stringify(request))
        })()
      }
      return startPromise
    }

    const closeAfterTerminalFrame = async () => {
      removeAbortHandler()
      await close()
    }

    const cancelRequest = async () => {
      if (cancelled) return
      cancelled = true
      await binding.wsV2Cancel?.(sessionId, requestId).catch(() => {})
    }

    const cancelAndClose = async () => {
      await cancelRequest()
      await close()
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        abortHandler = () => {
          void cancelAndClose()
        }
        if (signal?.aborted) {
          abortHandler()
          safeCloseController(controller)
          return
        }
        signal?.addEventListener('abort', abortHandler, { once: true })
      },
      async pull(controller) {
        if (streamClosed) return
        try {
          await ensureStarted()
          while (!signal?.aborted) {
            const raw = await binding.wsV2Next?.(sessionId)
            if (!raw) {
              throw new Error('WS v2 stream closed before completion')
            }
            const message = JSON.parse(raw) as Record<string, unknown>
            if (message.id === requestId) {
              if ('error' in message) {
                throw new Error(`WS v2 request rejected: ${JSON.stringify(message.error)}`)
              }
              continue
            }
            if (!isRequestNotification(message, requestId)) {
              continue
            }
            const method = message.method
            const params = (message.params ?? {}) as { data?: unknown; error?: unknown }
            if (method === 'chat.completions.delta') {
              if (typeof params.data === 'string') {
                controller.enqueue(encodeSseFrame(params.data))
                return
              }
              continue
            }
            if (method === 'chat.completions.completed') {
              controller.enqueue(encodeSseFrame('[DONE]'))
              safeCloseController(controller)
              await closeAfterTerminalFrame()
              return
            }
            if (method === 'chat.completions.error') {
              throw new Error(`WS v2 stream error: ${JSON.stringify(params.error)}`)
            }
          }
          safeCloseController(controller)
          await closeAfterTerminalFrame()
        } catch (error) {
          streamClosed = true
          removeAbortHandler()
          await close()
          controller.error(error)
        }
      },
      async cancel() {
        streamClosed = true
        removeAbortHandler()
        await cancelRequest()
        await close()
      },
    }, {
      highWaterMark: 0,
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'request-id': requestId,
      },
    })
  }
}

export function shouldUseOpenAICompatWsV2(): boolean {
  return process.env.NCODE_OPENAI_COMPAT_WS_V2 === '1'
}
