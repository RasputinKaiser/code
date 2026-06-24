import { describe, expect, test } from 'bun:test'

import {
  dispatchReplSandboxPermissionDialogResponse,
  dispatchReplSandboxPermissionHostDecision,
  dispatchReplWorkerSandboxPermissionDialogResponse,
  type ReplSandboxPermissionQueueItem,
  type ReplWorkerSandboxPermissionQueueItem,
} from './replSandboxPermissionDispatch.js'

function makeQueueItem(
  host: string,
  resolved: boolean[],
): ReplSandboxPermissionQueueItem {
  return {
    hostPattern: { host },
    resolvePromise: allow => {
      resolved.push(allow)
    },
  }
}

describe('dispatchReplSandboxPermissionHostDecision', () => {
  test('resolves all same-host requests, removes them from queue, and runs bridge cleanups', () => {
    const approved: boolean[] = []
    const denied: boolean[] = []
    const untouched: boolean[] = []
    const cleanups: string[] = []
    let queue: ReplSandboxPermissionQueueItem[] = [
      makeQueueItem('api.example.com', approved),
      makeQueueItem('api.example.com', denied),
      makeQueueItem('other.example.com', untouched),
    ]
    const sandboxBridgeCleanupMap = new Map<string, Array<() => void>>([
      [
        'api.example.com',
        [
          () => cleanups.push('first'),
          () => cleanups.push('second'),
        ],
      ],
    ])

    dispatchReplSandboxPermissionHostDecision(
      {
        host: 'api.example.com',
        allow: false,
      },
      {
        setSandboxPermissionRequestQueue: update => {
          queue = update(queue)
        },
        sandboxBridgeCleanupMap,
      },
    )

    expect(approved).toEqual([false])
    expect(denied).toEqual([false])
    expect(untouched).toEqual([])
    expect(queue.map(item => item.hostPattern.host)).toEqual(['other.example.com'])
    expect(cleanups).toEqual(['first', 'second'])
    expect(sandboxBridgeCleanupMap.has('api.example.com')).toBe(false)
  })
})

describe('dispatchReplSandboxPermissionDialogResponse', () => {
  test('is a no-op when queue head is missing', () => {
    const persistCalls: Array<{ host: string; allow: boolean }> = []
    const sandboxBridgeCleanupMap = new Map<string, Array<() => void>>()
    let queue: ReplSandboxPermissionQueueItem[] = []

    dispatchReplSandboxPermissionDialogResponse(
      {
        response: {
          allow: true,
          persistToSettings: true,
        },
        currentRequest: undefined,
      },
      {
        persistHostRule: params => {
          persistCalls.push(params)
        },
        setSandboxPermissionRequestQueue: update => {
          queue = update(queue)
        },
        sandboxBridgeCleanupMap,
      },
    )

    expect(persistCalls).toEqual([])
    expect(queue).toEqual([])
  })

  test('persists rule when requested and resolves all pending requests for the approved host', () => {
    const persisted: Array<{ host: string; allow: boolean }> = []
    const hostAFirst: boolean[] = []
    const hostASecond: boolean[] = []
    const hostB: boolean[] = []
    const cleanupCalls: string[] = []
    let queue: ReplSandboxPermissionQueueItem[] = [
      makeQueueItem('allowed.example.com', hostAFirst),
      makeQueueItem('allowed.example.com', hostASecond),
      makeQueueItem('other.example.com', hostB),
    ]
    const sandboxBridgeCleanupMap = new Map<string, Array<() => void>>([
      ['allowed.example.com', [() => cleanupCalls.push('cleanup')]],
    ])

    dispatchReplSandboxPermissionDialogResponse(
      {
        response: {
          allow: true,
          persistToSettings: true,
        },
        currentRequest: queue[0],
      },
      {
        persistHostRule: params => {
          persisted.push(params)
        },
        setSandboxPermissionRequestQueue: update => {
          queue = update(queue)
        },
        sandboxBridgeCleanupMap,
      },
    )

    expect(persisted).toEqual([
      {
        host: 'allowed.example.com',
        allow: true,
      },
    ])
    expect(hostAFirst).toEqual([true])
    expect(hostASecond).toEqual([true])
    expect(hostB).toEqual([])
    expect(queue.map(item => item.hostPattern.host)).toEqual(['other.example.com'])
    expect(cleanupCalls).toEqual(['cleanup'])
  })
})

describe('dispatchReplWorkerSandboxPermissionDialogResponse', () => {
  function workerRequest(
    host: string,
  ): ReplWorkerSandboxPermissionQueueItem {
    return {
      requestId: 'req-1',
      workerName: 'worker-a',
      host,
    }
  }

  test('forwards leader response, persists only allow+dont-ask-again, and dequeues request', () => {
    const sent: Array<{
      workerName: string
      requestId: string
      host: string
      allow: boolean
    }> = []
    const persisted: string[] = []
    let dequeued = 0

    dispatchReplWorkerSandboxPermissionDialogResponse(
      {
        response: {
          allow: true,
          persistToSettings: true,
        },
        currentRequest: workerRequest('host.example.com'),
      },
      {
        sendWorkerResponse: params => {
          sent.push(params)
        },
        persistAllowedHostRule: host => {
          persisted.push(host)
        },
        dequeueWorkerRequest: () => {
          dequeued += 1
        },
      },
    )

    expect(sent).toEqual([
      {
        workerName: 'worker-a',
        requestId: 'req-1',
        host: 'host.example.com',
        allow: true,
      },
    ])
    expect(persisted).toEqual(['host.example.com'])
    expect(dequeued).toBe(1)
  })

  test('does not persist deny responses even when persistToSettings is true', () => {
    const persisted: string[] = []

    dispatchReplWorkerSandboxPermissionDialogResponse(
      {
        response: {
          allow: false,
          persistToSettings: true,
        },
        currentRequest: workerRequest('deny.example.com'),
      },
      {
        sendWorkerResponse: () => {},
        persistAllowedHostRule: host => {
          persisted.push(host)
        },
        dequeueWorkerRequest: () => {},
      },
    )

    expect(persisted).toEqual([])
  })
})
