import type { QueryEngineReplEvent } from '../QueryEngine.js'
import type { QueryParams } from '../query.js'
import type { Terminal } from '../query/transitions.js'
import {
  runLocalQueryEngineTurn,
  type LocalQueryEngineControllerDeps,
} from './localQueryEngineController.js'
import { logForDebugging } from '../utils/debug.js'

export type LocalQueryEngineTurnHooks = {
  onStart?: () => void | Promise<void>
  onEvent: (event: QueryEngineReplEvent) => void | Promise<void>
  onComplete?: (result: {
    terminal: Terminal
    eventCount: number
  }) => void | Promise<void>
  onError?: (error: unknown) => void | Promise<void>
  onFinally?: () => void | Promise<void>
}

export type ExecuteLocalQueryEngineTurnOptions = {
  params: QueryParams
  hooks: LocalQueryEngineTurnHooks
}

export type LocalQueryEngineTurnResult = {
  terminal: Terminal
  eventCount: number
}

/**
 * Session-layer local turn executor.
 *
 * This keeps lifecycle orchestration (start/event/complete/error/finally)
 * outside the REPL so UI code can stay focused on state projection.
 */
export async function executeLocalQueryEngineTurn(
  options: ExecuteLocalQueryEngineTurnOptions,
  deps?: LocalQueryEngineControllerDeps,
): Promise<LocalQueryEngineTurnResult> {
  const { params, hooks } = options
  const { onStart, onEvent, onComplete, onError, onFinally } = hooks

  let eventCount = 0

  try {
    await onStart?.()
    logForDebugging('[ncode-debug] executeLocalQueryEngineTurn before runLocalQueryEngineTurn')

    const terminal = await runLocalQueryEngineTurn(
      {
        params,
        onEvent: async event => {
          eventCount += 1
          logForDebugging(`[ncode-debug] executeLocalQueryEngineTurn onEvent ${(event && typeof event === 'object' && 'type' in event) ? String(event.type) : 'unknown'}`)
        await onEvent(event)
        },
      },
      deps,
    )

    logForDebugging('[ncode-debug] executeLocalQueryEngineTurn after runLocalQueryEngineTurn')
    const result: LocalQueryEngineTurnResult = {
      terminal,
      eventCount,
    }

    await onComplete?.(result)
    return result
  } catch (error) {
    await onError?.(error)
    throw error
  } finally {
    await onFinally?.()
  }
}
