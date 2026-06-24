import type { QueryEngineReplEvent } from '../QueryEngine.js'
import type { QueryParams } from '../query.js'
import type { Terminal } from '../query/transitions.js'
import { logForDebugging } from '../utils/debug.js'
import { inspect } from 'util'

export type LocalQueryTurnRunner = (
  params: QueryParams,
) => AsyncGenerator<QueryEngineReplEvent, Terminal>

export type RunLocalQueryEngineTurnOptions = {
  params: QueryParams
  onEvent: (event: QueryEngineReplEvent) => void | Promise<void>
}

export type LocalQueryEngineControllerDeps = {
  runTurn?: LocalQueryTurnRunner
}

/**
 * Runs one local QueryEngine turn and forwards each yielded event to the
 * provided callback. Returns after the turn generator completes.
 */
export async function runLocalQueryEngineTurn(
  options: RunLocalQueryEngineTurnOptions,
  deps?: LocalQueryEngineControllerDeps,
): Promise<Terminal> {
  const { params, onEvent } = options
  logForDebugging('[ncode-debug] runLocalQueryEngineTurn create stream')
  const stream = deps?.runTurn
    ? deps.runTurn(params)
    : (await import('../QueryEngine.js')).runReplTurn(params)

  while (true) {
    logForDebugging('[ncode-debug] runLocalQueryEngineTurn before stream.next')
    const next = await stream.next()
    if (next.done) {
      logForDebugging('[ncode-debug] runLocalQueryEngineTurn stream done')
      return next.value
    }
    logForDebugging('[ncode-debug] runLocalQueryEngineTurn stream yielded event')
    if (
      !next.value ||
      typeof next.value !== 'object' ||
      !('type' in next.value)
    ) {
      logForDebugging(
        `[ncode-debug] runLocalQueryEngineTurn yielded nonlocal event keys=${next.value && typeof next.value === 'object' ? Object.keys(next.value as Record<string, unknown>).join(',') : typeof next.value}`,
      )
      logForDebugging(
        `[ncode-debug] runLocalQueryEngineTurn yielded nonlocal event value=${inspect(next.value, { depth: 4, breakLength: 120 })}`,
      )
    }
    await onEvent(next.value)
  }
}
