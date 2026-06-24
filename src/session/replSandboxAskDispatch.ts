import type { UUID } from 'crypto'
import type { NetworkHostPattern } from '../utils/sandbox/sandbox-adapter.js'
import type { ReplSandboxPermissionQueueItem } from './replSandboxPermissionDispatch.js'

type BridgeResponse = {
  behavior: 'allow' | 'deny' | string
}

type BridgeCallbacks = {
  sendRequest: (
    requestId: string,
    toolName: string,
    input: { host: string },
    toolUseId: string,
    title: string,
  ) => void
  onResponse: (
    requestId: string,
    callback: (response: BridgeResponse) => void,
  ) => () => void
  cancelRequest: (requestId: string) => void
}

export async function dispatchReplSandboxAsk(
  hostPattern: NetworkHostPattern,
  state: {
    swarmsEnabled: boolean
    swarmWorker: boolean
    bridgeModeEnabled: boolean
  },
  deps: {
    generateSandboxRequestId: () => string
    sendSandboxPermissionRequestViaMailbox: (
      host: string,
      requestId: string,
    ) => Promise<boolean>
    registerSandboxPermissionCallback: (params: {
      requestId: string
      host: string
      resolve: (allow: boolean) => void
    }) => void
    setSandboxPermissionRequestQueue: (
      update: (
        prev: ReplSandboxPermissionQueueItem[],
      ) => ReplSandboxPermissionQueueItem[],
    ) => void
    setAppState: (
      update: (prev: {
        pendingSandboxRequest?: { requestId: string; host: string } | undefined
      }) => {
        pendingSandboxRequest?: { requestId: string; host: string } | undefined
      },
    ) => void
    getBridgeCallbacks: () => BridgeCallbacks | null | undefined
    generateBridgeRequestId: () => UUID
    sandboxNetworkAccessToolName: string
    dispatchHostDecision: (params: { host: string; allow: boolean }) => void
    sandboxBridgeCleanupMap: Map<string, Array<() => void>>
  },
): Promise<boolean> {
  if (state.swarmsEnabled && state.swarmWorker) {
    const requestId = deps.generateSandboxRequestId()
    const sent = await deps.sendSandboxPermissionRequestViaMailbox(
      hostPattern.host,
      requestId,
    )
    return new Promise(resolveShouldAllowHost => {
      if (!sent) {
        deps.setSandboxPermissionRequestQueue(prev => [
          ...prev,
          {
            hostPattern,
            resolvePromise: resolveShouldAllowHost,
          },
        ])
        return
      }

      deps.registerSandboxPermissionCallback({
        requestId,
        host: hostPattern.host,
        resolve: resolveShouldAllowHost,
      })
      deps.setAppState(prev => ({
        ...prev,
        pendingSandboxRequest: {
          requestId,
          host: hostPattern.host,
        },
      }))
    })
  }

  return new Promise(resolveShouldAllowHost => {
    let resolved = false
    function resolveOnce(allow: boolean): void {
      if (resolved) return
      resolved = true
      resolveShouldAllowHost(allow)
    }

    deps.setSandboxPermissionRequestQueue(prev => [
      ...prev,
      {
        hostPattern,
        resolvePromise: resolveOnce,
      },
    ])

    if (!state.bridgeModeEnabled) {
      return
    }
    const bridgeCallbacks = deps.getBridgeCallbacks()
    if (!bridgeCallbacks) {
      return
    }

    const bridgeRequestId = deps.generateBridgeRequestId()
    bridgeCallbacks.sendRequest(
      bridgeRequestId,
      deps.sandboxNetworkAccessToolName,
      { host: hostPattern.host },
      deps.generateBridgeRequestId(),
      `Allow network connection to ${hostPattern.host}?`,
    )
    const unsubscribe = bridgeCallbacks.onResponse(bridgeRequestId, response => {
      unsubscribe()
      deps.dispatchHostDecision({
        host: hostPattern.host,
        allow: response.behavior === 'allow',
      })
    })

    const cleanup = () => {
      unsubscribe()
      bridgeCallbacks.cancelRequest(bridgeRequestId)
    }
    const existing = deps.sandboxBridgeCleanupMap.get(hostPattern.host) ?? []
    existing.push(cleanup)
    deps.sandboxBridgeCleanupMap.set(hostPattern.host, existing)
  })
}
