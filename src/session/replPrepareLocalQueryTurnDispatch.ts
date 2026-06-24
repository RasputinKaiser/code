import type { ToolPermissionContext } from '../Tool.js'
import type { SetAppState } from '../utils/messageQueueManager.js'
import {
  checkAndDisableAutoModeIfNeeded,
  checkAndDisableBypassPermissionsIfNeeded,
} from '../utils/permissions/bypassPermissionsKillswitch.js'
import type {
  PrepareLocalQueryEngineTurnDeps,
  PrepareLocalQueryEngineTurnOptions,
  PreparedLocalQueryEngineTurn,
} from './localQueryTurnPreparation.js'
import { prepareLocalQueryEngineTurn } from './localQueryTurnPreparation.js'
import { logForDebugging } from '../utils/debug.js'

export type ReplPrepareLocalQueryTurnDispatchOptions =
  PrepareLocalQueryEngineTurnOptions & {
    toolPermissionContext: ToolPermissionContext
    setAppState: SetAppState
    shouldCheckAutoMode: boolean
    fastMode?: boolean
  }

export type ReplPrepareLocalQueryTurnDispatchDeps =
  PrepareLocalQueryEngineTurnDeps & {
    queryCheckpoint: (label: string) => void
    resetTurnHookDuration: () => void
    resetTurnToolDuration: () => void
    resetTurnClassifierDuration: () => void
  }

export async function dispatchReplPrepareLocalQueryTurn(
  options: ReplPrepareLocalQueryTurnDispatchOptions,
  deps: ReplPrepareLocalQueryTurnDispatchDeps,
): Promise<PreparedLocalQueryEngineTurn> {
  logForDebugging('[ncode-debug] prepare dispatch start')
  deps.queryCheckpoint('query_context_loading_start')

  const bypassPromise = checkAndDisableBypassPermissionsIfNeeded(
      options.toolPermissionContext,
      options.setAppState,
    ).then(() => { logForDebugging('[ncode-debug] prepare dispatch bypass check done') })
    const autoPromise = options.shouldCheckAutoMode
      ? checkAndDisableAutoModeIfNeeded(
          options.toolPermissionContext,
          options.setAppState,
          options.fastMode,
        ).then(() => { logForDebugging('[ncode-debug] prepare dispatch auto check done') })
      : undefined
    const preparePromise = prepareLocalQueryEngineTurn(options, deps).then(turn => { logForDebugging('[ncode-debug] prepare dispatch prepareLocalQueryEngineTurn done'); return turn })

  const [, , preparedTurn] = await Promise.all([
    bypassPromise,
    autoPromise,
    preparePromise,
  ])

  logForDebugging('[ncode-debug] prepare dispatch all await complete')
  deps.queryCheckpoint('query_context_loading_end')
  deps.queryCheckpoint('query_query_start')
  deps.resetTurnHookDuration()
  deps.resetTurnToolDuration()
  deps.resetTurnClassifierDuration()

  return preparedTurn
}
