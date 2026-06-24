import { describe, expect, test } from 'bun:test'

import { dispatchReplSubmitBookkeeping } from './replSubmitBookkeepingDispatch.js'
import type { ReplSubmitBookkeepingPlan } from './replSubmitBookkeepingPlan.js'
import type { ReplSubmitState } from './replSubmitState.js'

function makeSubmitState(
  overrides: Partial<ReplSubmitState> = {},
): ReplSubmitState {
  return {
    isSlashCommand: false,
    submitsNow: true,
    shouldAddToHistory: true,
    shouldRestoreStashImmediately: false,
    shouldProvideDeferredStashRestore: false,
    shouldClearInputValue: true,
    shouldClearPastedContents: true,
    shouldResetInputMode: true,
    shouldIncrementSubmitCount: true,
    shouldClearBuffer: true,
    shouldShowProcessingPlaceholder: true,
    ...overrides,
  }
}

function makePlan(
  overrides: Partial<ReplSubmitBookkeepingPlan> = {},
): ReplSubmitBookkeepingPlan {
  return {
    historyEntry: {
      display: '/ship',
      pastedContents: {},
    },
    inputValueUpdate: {
      kind: 'clear',
      value: '',
      cursorOffset: 0,
    },
    pastedContentsUpdate: {
      kind: 'clear',
      value: {},
    },
    ...overrides,
  }
}

describe('dispatchReplSubmitBookkeeping', () => {
  test('preserves the existing history, clear, placeholder, and attribution ordering', () => {
    const events: string[] = []

    dispatchReplSubmitBookkeeping(
      {
        input: 'echo test',
        inputMode: 'bash',
        submitState: makeSubmitState(),
        submitBookkeepingPlan: makePlan(),
      },
      {
        addToHistory: entry => {
          events.push(`history:${entry.display}`)
        },
        prependToShellHistoryCache: command => {
          events.push(`shell:${command}`)
        },
        setInputValue: value => {
          events.push(`input:${value}`)
        },
        setCursorOffset: offset => {
          events.push(`cursor:${offset}`)
        },
        clearStashedPrompt: () => {
          events.push('clearStash')
        },
        setPastedContents: value => {
          events.push(`pasted:${Object.keys(value).length}`)
        },
        setInputMode: mode => {
          events.push(`mode:${mode}`)
        },
        clearIDESelection: () => {
          events.push('ide:clear')
        },
        incrementSubmitCount: () => {
          events.push('submit:inc')
        },
        clearBuffer: () => {
          events.push('buffer:clear')
        },
        resetTipPickedThisTurn: () => {
          events.push('tip:reset')
        },
        setUserInputOnProcessing: value => {
          events.push(`processing:${value}`)
        },
        resetTimingRefs: () => {
          events.push('timing:reset')
        },
        applyCommitAttribution: () => {
          events.push('attribution')
        },
      },
    )

    expect(events).toEqual([
      'history:/ship',
      'shell:echo test',
      'input:',
      'cursor:0',
      'pasted:0',
      'mode:prompt',
      'ide:clear',
      'submit:inc',
      'buffer:clear',
      'tip:reset',
      'processing:echo test',
      'timing:reset',
      'attribution',
    ])
  })

  test('preserves stash restore semantics before prompt reset bookkeeping', () => {
    const events: string[] = []

    dispatchReplSubmitBookkeeping(
      {
        input: 'prompt',
        inputMode: 'prompt',
        submitState: makeSubmitState({
          shouldShowProcessingPlaceholder: false,
        }),
        submitBookkeepingPlan: makePlan({
          historyEntry: undefined,
          inputValueUpdate: {
            kind: 'restore',
            value: 'saved text',
            cursorOffset: 7,
          },
          pastedContentsUpdate: {
            kind: 'restore',
            value: {
              3: {
                id: 3,
                type: 'text',
                content: 'saved',
              },
            },
          },
        }),
      },
      {
        addToHistory: () => {
          events.push('history')
        },
        prependToShellHistoryCache: () => {
          events.push('shell')
        },
        setInputValue: value => {
          events.push(`input:${value}`)
        },
        setCursorOffset: offset => {
          events.push(`cursor:${offset}`)
        },
        clearStashedPrompt: () => {
          events.push('clearStash')
        },
        setPastedContents: value => {
          events.push(`pasted:${Object.keys(value).join(',')}`)
        },
        setInputMode: mode => {
          events.push(`mode:${mode}`)
        },
        clearIDESelection: () => {
          events.push('ide:clear')
        },
        incrementSubmitCount: () => {
          events.push('submit:inc')
        },
        clearBuffer: () => {
          events.push('buffer:clear')
        },
        resetTipPickedThisTurn: () => {
          events.push('tip:reset')
        },
        setUserInputOnProcessing: value => {
          events.push(`processing:${value}`)
        },
        resetTimingRefs: () => {
          events.push('timing:reset')
        },
        applyCommitAttribution: () => {
          events.push('attribution')
        },
      },
    )

    expect(events).toEqual([
      'input:saved text',
      'cursor:7',
      'clearStash',
      'pasted:3',
      'mode:prompt',
      'ide:clear',
      'submit:inc',
      'buffer:clear',
      'tip:reset',
      'attribution',
    ])
  })

  test('does nothing after direct field updates when submitState does not reset input mode', () => {
    const events: string[] = []

    dispatchReplSubmitBookkeeping(
      {
        input: 'prompt',
        inputMode: 'prompt',
        submitState: makeSubmitState({
          shouldResetInputMode: false,
          shouldIncrementSubmitCount: false,
          shouldClearBuffer: false,
          shouldShowProcessingPlaceholder: false,
        }),
        submitBookkeepingPlan: makePlan({
          historyEntry: undefined,
          inputValueUpdate: {
            kind: 'none',
          },
          pastedContentsUpdate: {
            kind: 'none',
          },
        }),
      },
      {
        addToHistory: () => {
          events.push('history')
        },
        prependToShellHistoryCache: () => {
          events.push('shell')
        },
        setInputValue: () => {
          events.push('input')
        },
        setCursorOffset: () => {
          events.push('cursor')
        },
        clearStashedPrompt: () => {
          events.push('clearStash')
        },
        setPastedContents: () => {
          events.push('pasted')
        },
        setInputMode: () => {
          events.push('mode')
        },
        clearIDESelection: () => {
          events.push('ide')
        },
        incrementSubmitCount: () => {
          events.push('submit')
        },
        clearBuffer: () => {
          events.push('buffer')
        },
        resetTipPickedThisTurn: () => {
          events.push('tip')
        },
        setUserInputOnProcessing: () => {
          events.push('processing')
        },
        resetTimingRefs: () => {
          events.push('timing')
        },
        applyCommitAttribution: () => {
          events.push('attribution')
        },
      },
    )

    expect(events).toEqual([])
  })
})
