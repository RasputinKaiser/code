import { describe, expect, test } from 'bun:test'

import type { ToolPermissionContext } from '../Tool.js'
import { dispatchReplToolPermissionContext } from './replToolPermissionContextDispatch.js'

function createContext(mode: ToolPermissionContext['mode']): ToolPermissionContext {
  return {
    mode,
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    pendingRuleSuggestions: [],
  }
}

describe('dispatchReplToolPermissionContext', () => {
  test('preserves mode only when explicitly requested and rechecks the live queue', async () => {
    let appState = {
      toolPermissionContext: createContext('acceptEdits'),
      sentinel: 1,
    }
    const events: string[] = []
    const queue = [
      {
        recheckPermission: () => {
          events.push('recheck-1')
        },
      },
      {
        recheckPermission: () => {
          events.push('recheck-2')
        },
      },
    ]

    dispatchReplToolPermissionContext(
      createContext('default'),
      { preserveMode: true },
      {
        setAppState: action => {
          appState = typeof action === 'function' ? action(appState) : action
          return appState
        },
        setToolUseConfirmQueue: action => {
          const nextQueue = typeof action === 'function' ? action(queue) : action
          expect(nextQueue).toBe(queue)
          return nextQueue
        },
      },
    )

    expect(appState.toolPermissionContext.mode).toBe('acceptEdits')
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(events).toEqual(['recheck-1', 'recheck-2'])

    dispatchReplToolPermissionContext(
      createContext('plan'),
      undefined,
      {
        setAppState: action => {
          appState = typeof action === 'function' ? action(appState) : action
          return appState
        },
        setToolUseConfirmQueue: action => {
          const nextQueue = typeof action === 'function' ? action(queue) : action
          return nextQueue
        },
      },
    )

    expect(appState.toolPermissionContext.mode).toBe('plan')
  })
})
