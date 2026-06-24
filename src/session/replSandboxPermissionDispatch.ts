import type { NetworkHostPattern } from '../utils/sandbox/sandbox-adapter.js'

export type ReplSandboxPermissionQueueItem = {
  hostPattern: NetworkHostPattern
  resolvePromise: (allowConnection: boolean) => void
}

export type ReplWorkerSandboxPermissionQueueItem = {
  requestId: string
  workerName: string
  host: string
}

export function dispatchReplSandboxPermissionHostDecision(
  {
    host,
    allow,
  }: {
    host: string
    allow: boolean
  },
  {
    setSandboxPermissionRequestQueue,
    sandboxBridgeCleanupMap,
  }: {
    setSandboxPermissionRequestQueue: (
      update: (
        queue: ReplSandboxPermissionQueueItem[],
      ) => ReplSandboxPermissionQueueItem[],
    ) => void
    sandboxBridgeCleanupMap: Map<string, Array<() => void>>
  },
): void {
  setSandboxPermissionRequestQueue(queue => {
    queue
      .filter(item => item.hostPattern.host === host)
      .forEach(item => item.resolvePromise(allow))
    return queue.filter(item => item.hostPattern.host !== host)
  })

  const cleanups = sandboxBridgeCleanupMap.get(host)
  if (cleanups) {
    for (const fn of cleanups) {
      fn()
    }
    sandboxBridgeCleanupMap.delete(host)
  }
}

export function dispatchReplSandboxPermissionDialogResponse(
  {
    response,
    currentRequest,
  }: {
    response: {
      allow: boolean
      persistToSettings: boolean
    }
    currentRequest: ReplSandboxPermissionQueueItem | undefined
  },
  {
    persistHostRule,
    setSandboxPermissionRequestQueue,
    sandboxBridgeCleanupMap,
  }: {
    persistHostRule: (params: { host: string; allow: boolean }) => void
    setSandboxPermissionRequestQueue: (
      update: (
        queue: ReplSandboxPermissionQueueItem[],
      ) => ReplSandboxPermissionQueueItem[],
    ) => void
    sandboxBridgeCleanupMap: Map<string, Array<() => void>>
  },
): void {
  if (!currentRequest) return
  const approvedHost = currentRequest.hostPattern.host

  if (response.persistToSettings) {
    persistHostRule({
      host: approvedHost,
      allow: response.allow,
    })
  }

  dispatchReplSandboxPermissionHostDecision(
    {
      host: approvedHost,
      allow: response.allow,
    },
    {
      setSandboxPermissionRequestQueue,
      sandboxBridgeCleanupMap,
    },
  )
}

export function dispatchReplWorkerSandboxPermissionDialogResponse(
  {
    response,
    currentRequest,
  }: {
    response: {
      allow: boolean
      persistToSettings: boolean
    }
    currentRequest: ReplWorkerSandboxPermissionQueueItem | undefined
  },
  {
    sendWorkerResponse,
    persistAllowedHostRule,
    dequeueWorkerRequest,
  }: {
    sendWorkerResponse: (params: {
      workerName: string
      requestId: string
      host: string
      allow: boolean
    }) => void
    persistAllowedHostRule: (host: string) => void
    dequeueWorkerRequest: () => void
  },
): void {
  if (!currentRequest) return
  const approvedHost = currentRequest.host

  sendWorkerResponse({
    workerName: currentRequest.workerName,
    requestId: currentRequest.requestId,
    host: approvedHost,
    allow: response.allow,
  })

  if (response.persistToSettings && response.allow) {
    persistAllowedHostRule(approvedHost)
  }

  dequeueWorkerRequest()
}
