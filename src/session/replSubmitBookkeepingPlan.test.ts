import { describe, expect, it } from 'bun:test'
import { resolveReplSubmitState } from './replSubmitState.js'
import { resolveReplSubmitBookkeepingPlan } from './replSubmitBookkeepingPlan.js'

describe('resolveReplSubmitBookkeepingPlan', () => {
  it('adds normal prompt submits to history and clears the live prompt state', () => {
    const submitState = resolveReplSubmitState({
      input: 'hello world',
      inputMode: 'prompt',
      isLoading: false,
      isRemoteMode: false,
      hasSpeculationAccept: false,
      fromKeybinding: false,
      hasStashedPrompt: false,
    })

    expect(
      resolveReplSubmitBookkeepingPlan({
        submitState,
        input: 'hello world',
        inputMode: 'prompt',
        hasSpeculationAccept: false,
        pastedContents: {
          1: {
            id: 1,
            type: 'text',
            content: 'attachment',
          },
        },
        stashedPrompt: undefined,
      }),
    ).toEqual({
      historyEntry: {
        display: 'hello world',
        pastedContents: {
          1: {
            id: 1,
            type: 'text',
            content: 'attachment',
          },
        },
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
    })
  })

  it('preserves speculation history formatting and strips pasted-contents history', () => {
    const submitState = resolveReplSubmitState({
      input: 'accept speculation',
      inputMode: 'prompt',
      isLoading: false,
      isRemoteMode: false,
      hasSpeculationAccept: true,
      fromKeybinding: false,
      hasStashedPrompt: false,
    })

    expect(
      resolveReplSubmitBookkeepingPlan({
        submitState,
        input: 'accept speculation',
        inputMode: 'bash',
        hasSpeculationAccept: true,
        pastedContents: {
          2: {
            id: 2,
            type: 'text',
            content: 'attachment',
          },
        },
        stashedPrompt: undefined,
      }).historyEntry,
    ).toEqual({
      display: 'accept speculation',
      pastedContents: {},
    })
  })

  it('restores the stash immediately for the existing remote non-slash contract', () => {
    const submitState = resolveReplSubmitState({
      input: 'remote prompt',
      inputMode: 'prompt',
      isLoading: true,
      isRemoteMode: true,
      hasSpeculationAccept: false,
      fromKeybinding: false,
      hasStashedPrompt: true,
    })

    expect(
      resolveReplSubmitBookkeepingPlan({
        submitState,
        input: 'remote prompt',
        inputMode: 'prompt',
        hasSpeculationAccept: false,
        pastedContents: {},
        stashedPrompt: {
          text: 'saved draft',
          cursorOffset: 4,
          pastedContents: {
            3: {
              id: 3,
              type: 'text',
              content: 'saved attachment',
            },
          },
        },
      }),
    ).toEqual({
      historyEntry: {
        display: 'remote prompt',
        pastedContents: {},
      },
      inputValueUpdate: {
        kind: 'restore',
        value: 'saved draft',
        cursorOffset: 4,
      },
      pastedContentsUpdate: {
        kind: 'restore',
        value: {
          3: {
            id: 3,
            type: 'text',
            content: 'saved attachment',
          },
        },
      },
    })
  })

  it('keeps queued slash-command submits as no-op bookkeeping aside from history', () => {
    const submitState = resolveReplSubmitState({
      input: '/model',
      inputMode: 'prompt',
      isLoading: true,
      isRemoteMode: false,
      hasSpeculationAccept: false,
      fromKeybinding: false,
      hasStashedPrompt: true,
    })

    expect(
      resolveReplSubmitBookkeepingPlan({
        submitState,
        input: '/model',
        inputMode: 'prompt',
        hasSpeculationAccept: false,
        pastedContents: {},
        stashedPrompt: {
          text: 'saved draft',
          cursorOffset: 4,
          pastedContents: {},
        },
      }),
    ).toEqual({
      historyEntry: {
        display: '/model',
        pastedContents: {},
      },
      inputValueUpdate: {
        kind: 'none',
      },
      pastedContentsUpdate: {
        kind: 'none',
      },
    })
  })
})
