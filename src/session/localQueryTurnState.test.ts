import { describe, expect, it } from 'bun:test'

import {
  handleSkippedLocalQueryTurn,
  syncAllowedToolsForTurn,
} from './localQueryTurnState.js'

type TestState = {
  toolPermissionContext: {
    alwaysAllowRules: {
      command?: string[]
      other?: string[]
    }
  }
  untouched: string
}

describe('syncAllowedToolsForTurn', () => {
  it('updates command allow rules when they change', () => {
    let state: TestState = {
      toolPermissionContext: {
        alwaysAllowRules: {
          command: ['old'],
          other: ['keep'],
        },
      },
      untouched: 'value',
    }

    syncAllowedToolsForTurn(
      {
        setState: updater => {
          state = updater(state)
        },
      },
      ['new-a', 'new-b'],
    )

    expect(state).toEqual({
      toolPermissionContext: {
        alwaysAllowRules: {
          command: ['new-a', 'new-b'],
          other: ['keep'],
        },
      },
      untouched: 'value',
    })
  })
})

describe('handleSkippedLocalQueryTurn', () => {
  it('runs compact-boundary callback when a compact boundary is present', () => {
    const calls: string[] = []

    handleSkippedLocalQueryTurn({
      newMessages: [
        { type: 'assistant' },
        { type: 'system', subtype: 'compact_boundary' },
      ],
      resetLoadingState: () => {
        calls.push('reset')
      },
      setAbortController: abortController => {
        calls.push(abortController === null ? 'abort:null' : 'abort:set')
      },
      onCompactBoundary: () => {
        calls.push('compact')
      },
    })

    expect(calls).toEqual(['compact', 'reset', 'abort:null'])
  })
})
