import type { Dispatch, SetStateAction } from 'react'

import type { ToolPermissionContext } from '../Tool.js'

type PermissionContextState = {
  toolPermissionContext: ToolPermissionContext
}

type PermissionQueueItem = {
  recheckPermission: () => void | Promise<void>
}

export function dispatchReplToolPermissionContext<
  TState extends PermissionContextState,
>(
  context: ToolPermissionContext,
  options: { preserveMode?: boolean } | undefined,
  deps: {
    setAppState: Dispatch<SetStateAction<TState>>
    setToolUseConfirmQueue: Dispatch<SetStateAction<PermissionQueueItem[]>>
  },
): void {
  deps.setAppState(prev => ({
    ...prev,
    toolPermissionContext: {
      ...context,
      mode: options?.preserveMode ? prev.toolPermissionContext.mode : context.mode,
    },
  }))

  setImmediate(setToolUseConfirmQueue => {
    setToolUseConfirmQueue(currentQueue => {
      currentQueue.forEach(item => {
        void item.recheckPermission()
      })
      return currentQueue
    })
  }, deps.setToolUseConfirmQueue)
}
