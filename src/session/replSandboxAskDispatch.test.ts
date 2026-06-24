import { describe, expect, test } from 'bun:test'
import { dispatchReplSandboxAsk } from './replSandboxAskDispatch.js'
import type { ReplSandboxPermissionQueueItem } from './replSandboxPermissionDispatch.js'

describe('dispatchReplSandboxAsk', () => {
  test('worker path falls back to local queue when mailbox send fails', async () => {
    let queue: ReplSandboxPermissionQueueItem[] = []

    const promise = dispatchReplSandboxAsk(
      { host: 'api.example.com' } as never,
      {
        swarmsEnabled: true,
        swarmWorker: true,
        bridgeModeEnabled: false,
      },
      {
        generateSandboxRequestId: () => 'req-1',
        sendSandboxPermissionRequestViaMailbox: async () => false,
        registerSandboxPermissionCallback: () => {
          throw new Error('should not register callback')
        },
        setSandboxPermissionRequestQueue: update => {
          queue = update(queue)
        },
        setAppState: () => {
          throw new Error('should not set app state')
        },
        getBridgeCallbacks: () => null,
        generateBridgeRequestId: () => 'bridge-id' as never,
        sandboxNetworkAccessToolName: 'sandbox-network-access',
        dispatchHostDecision: () => {},
        sandboxBridgeCleanupMap: new Map(),
      },
    )

    await Promise.resolve()
    expect(queue).toHaveLength(1)
    queue[0]!.resolvePromise(true)
    await expect(promise).resolves.toBe(true)
  })

  test('worker path registers callback and pending app state when mailbox send succeeds', async () => {
    let registeredResolve: ((allow: boolean) => void) | null = null
    let pendingHost: string | null = null

    const promise = dispatchReplSandboxAsk(
      { host: 'api.example.com' } as never,
      {
        swarmsEnabled: true,
        swarmWorker: true,
        bridgeModeEnabled: false,
      },
      {
        generateSandboxRequestId: () => 'req-1',
        sendSandboxPermissionRequestViaMailbox: async () => true,
        registerSandboxPermissionCallback: params => {
          registeredResolve = params.resolve
        },
        setSandboxPermissionRequestQueue: () => {
          throw new Error('should not queue locally')
        },
        setAppState: update => {
          pendingHost = update({}).pendingSandboxRequest?.host ?? null
        },
        getBridgeCallbacks: () => null,
        generateBridgeRequestId: () => 'bridge-id' as never,
        sandboxNetworkAccessToolName: 'sandbox-network-access',
        dispatchHostDecision: () => {},
        sandboxBridgeCleanupMap: new Map(),
      },
    )

    await Promise.resolve()
    expect(pendingHost).toBe('api.example.com')
    expect(registeredResolve).not.toBeNull()
    registeredResolve!(false)
    await expect(promise).resolves.toBe(false)
  })

  test('local path wires bridge responses through host-level decision dispatch and cleanup', async () => {
    let queue: ReplSandboxPermissionQueueItem[] = []
    let sentRequest: {
      requestId: string
      toolName: string
      input: { host: string }
      toolUseId: string
      title: string
    } | null = null
    let onResponseCallback: ((response: { behavior: string }) => void) | null =
      null
    const events: string[] = []
    const cleanupMap = new Map<string, Array<() => void>>()

    const promise = dispatchReplSandboxAsk(
      { host: 'bridge.example.com' } as never,
      {
        swarmsEnabled: false,
        swarmWorker: false,
        bridgeModeEnabled: true,
      },
      {
        generateSandboxRequestId: () => 'req-1',
        sendSandboxPermissionRequestViaMailbox: async () => false,
        registerSandboxPermissionCallback: () => {},
        setSandboxPermissionRequestQueue: update => {
          queue = update(queue)
        },
        setAppState: () => {},
        getBridgeCallbacks: () => ({
          sendRequest: (requestId, toolName, input, toolUseId, title) => {
            sentRequest = { requestId, toolName, input, toolUseId, title }
          },
          onResponse: (_requestId, callback) => {
            onResponseCallback = callback
            return () => {
              events.push('unsubscribe')
            }
          },
          cancelRequest: requestId => {
            events.push(`cancel:${requestId}`)
          },
        }),
        generateBridgeRequestId: () => 'bridge-id' as never,
        sandboxNetworkAccessToolName: 'sandbox-network-access',
        dispatchHostDecision: ({ host, allow }) => {
          events.push(`decision:${host}:${allow}`)
          const item = queue[0]
          if (item) {
            item.resolvePromise(allow)
          }
        },
        sandboxBridgeCleanupMap: cleanupMap,
      },
    )

    expect(queue).toHaveLength(1)
    expect(sentRequest).toEqual({
      requestId: 'bridge-id',
      toolName: 'sandbox-network-access',
      input: { host: 'bridge.example.com' },
      toolUseId: 'bridge-id',
      title: 'Allow network connection to bridge.example.com?',
    })
    expect(cleanupMap.get('bridge.example.com')).toHaveLength(1)

    onResponseCallback?.({ behavior: 'allow' })
    await expect(promise).resolves.toBe(true)
    expect(events).toEqual([
      'unsubscribe',
      'decision:bridge.example.com:true',
    ])
  })
})
