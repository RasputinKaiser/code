import { describe, expect, test } from 'bun:test'
import type { Command } from '../commands.js'
import type { DispatchReplPostBookkeepingSubmitDeps } from './replPostBookkeepingSubmitDispatch.js'
import type { ReplSubmitBookkeepingDispatchDeps } from './replSubmitBookkeepingDispatch.js'
import type { ReplSubmitPreludeDispatchDeps } from './replSubmitPreludeDispatch.js'
import { dispatchReplSubmit } from './replSubmitDispatch.js'

function makeCommand(name: string): Command {
  return {
    name,
    description: `${name} command`,
    type: 'local-jsx',
  } as unknown as Command
}

function makeBaseOptions(overrides: Record<string, unknown> = {}) {
  return {
    input: '/clear',
    helpers: {
      setCursorOffset: () => {},
      clearBuffer: () => {},
    },
    speculationAccept: undefined,
    fromKeybinding: false,
    inputMode: 'prompt',
    isLoading: false,
    commands: [makeCommand('clear')],
    isCommandEnabled: () => true,
    isRemoteMode: false,
    pastedContents: {},
    queryGuardActive: false,
    userType: undefined,
    willowMode: 'off',
    idleReturnDismissed: false,
    skipIdleCheck: false,
    lastQueryCompletionTimeMs: 5,
    getTotalInputTokens: () => 42,
    tokenThreshold: 100_000,
    idleThresholdMinutes: 75,
    expandPastedTextRefs: (input: string) => input,
    parseBackgroundPRShortcutInput: () => null,
    getInputValue: () => '/clear',
    mainLoopModel: 'gpt-test',
    stashedPrompt: undefined,
    getMessageCount: () => 7,
    cwd: '/repo',
    readFileState: { current: {} },
    ideSelection: undefined,
    abortController: null,
    isExternalLoading: false,
    streamMode: 'streaming',
    hasInterruptibleToolInProgress: false,
    querySource: 'repl',
    nowProvider: () => 123,
    ...overrides,
  } as const
}

describe('dispatchReplSubmit', () => {
  test('short-circuits after a handled prelude', async () => {
    const events: string[] = []

    await dispatchReplSubmit(makeBaseOptions(), {
      preludeDeps: {} as ReplSubmitPreludeDispatchDeps,
      bookkeepingDeps: {} as ReplSubmitBookkeepingDispatchDeps,
      postBookkeepingDeps: {} as DispatchReplPostBookkeepingSubmitDeps,
      resolveReplSubmitStateImpl: () => {
        events.push('state')
        return {
          isSlashCommand: true,
          submitsNow: true,
          shouldAddToHistory: true,
          shouldRestoreStashImmediately: false,
          shouldProvideDeferredStashRestore: false,
          shouldClearInputValue: true,
          shouldClearPastedContents: true,
          shouldResetInputMode: true,
          shouldIncrementSubmitCount: true,
          shouldClearBuffer: true,
          shouldShowProcessingPlaceholder: false,
        }
      },
      resolveReplSubmitPreludePlanImpl: () => {
        events.push('prelude-plan')
        return { type: 'continue' }
      },
      dispatchReplSubmitPreludeImpl: async options => {
        events.push('prelude-dispatch')
        expect(options.matchingSubmitCommand?.name).toBe('clear')
        return true
      },
      resolveReplSubmitBookkeepingPlanImpl: () => {
        events.push('bookkeeping-plan')
        return {
          historyEntry: undefined,
          inputValueUpdate: { kind: 'none' },
          pastedContentsUpdate: { kind: 'none' },
        }
      },
      dispatchReplSubmitBookkeepingImpl: () => {
        events.push('bookkeeping-dispatch')
      },
      dispatchReplPostBookkeepingSubmitImpl: async () => {
        events.push('post-dispatch')
        return 'leader'
      },
    })

    expect(events).toEqual(['state', 'prelude-plan', 'prelude-dispatch'])
  })

  test('runs prelude, bookkeeping, and post-bookkeeping in order', async () => {
    const events: string[] = []
    const bookkeepingPlan = {
      historyEntry: undefined,
      inputValueUpdate: { kind: 'none' as const },
      pastedContentsUpdate: { kind: 'none' as const },
    }

    await dispatchReplSubmit(makeBaseOptions(), {
      preludeDeps: {} as ReplSubmitPreludeDispatchDeps,
      bookkeepingDeps: {} as ReplSubmitBookkeepingDispatchDeps,
      postBookkeepingDeps: {} as DispatchReplPostBookkeepingSubmitDeps,
      resolveReplSubmitStateImpl: () => {
        events.push('state')
        return {
          isSlashCommand: true,
          submitsNow: true,
          shouldAddToHistory: true,
          shouldRestoreStashImmediately: false,
          shouldProvideDeferredStashRestore: true,
          shouldClearInputValue: true,
          shouldClearPastedContents: true,
          shouldResetInputMode: true,
          shouldIncrementSubmitCount: true,
          shouldClearBuffer: true,
          shouldShowProcessingPlaceholder: false,
        }
      },
      resolveReplSubmitPreludePlanImpl: () => {
        events.push('prelude-plan')
        return { type: 'continue' }
      },
      dispatchReplSubmitPreludeImpl: async () => {
        events.push('prelude-dispatch')
        return false
      },
      resolveReplSubmitBookkeepingPlanImpl: input => {
        events.push('bookkeeping-plan')
        expect(input.submitState.shouldProvideDeferredStashRestore).toBe(true)
        return bookkeepingPlan
      },
      dispatchReplSubmitBookkeepingImpl: ({ submitBookkeepingPlan }) => {
        events.push('bookkeeping-dispatch')
        expect(submitBookkeepingPlan).toBe(bookkeepingPlan)
      },
      dispatchReplPostBookkeepingSubmitImpl: async options => {
        events.push('post-dispatch')
        expect(options.shouldProvideDeferredStashRestore).toBe(true)
        expect(options.isSlashCommand).toBe(true)
        expect(options.matchedCommandType).toBe('local-jsx')
        return 'leader'
      },
    })

    expect(events).toEqual([
      'state',
      'prelude-plan',
      'prelude-dispatch',
      'bookkeeping-plan',
      'bookkeeping-dispatch',
      'post-dispatch',
    ])
  })

  test('plain prompt submit reaches post-bookkeeping as a non-slash leader path', async () => {
    const events: string[] = []

    await dispatchReplSubmit(
      makeBaseOptions({
        input: 'hello world',
        getInputValue: () => 'hello world',
        commands: [],
      }),
      {
        preludeDeps: {} as ReplSubmitPreludeDispatchDeps,
        bookkeepingDeps: {} as ReplSubmitBookkeepingDispatchDeps,
        postBookkeepingDeps: {} as DispatchReplPostBookkeepingSubmitDeps,
        dispatchReplSubmitPreludeImpl: async () => {
          events.push('prelude')
          return false
        },
        dispatchReplSubmitBookkeepingImpl: ({ submitState }) => {
          events.push(`bookkeeping:${String(submitState.isSlashCommand)}`)
        },
        dispatchReplPostBookkeepingSubmitImpl: async options => {
          events.push(
            `post:${String(options.isSlashCommand)}:${String(options.isRemoteMode)}:${String(options.matchedCommandType)}`,
          )
          return 'leader'
        },
      },
    )

    expect(events).toEqual([
      'prelude',
      'bookkeeping:false',
      'post:false:false:undefined',
    ])
  })

  test('normalizes a coalesced leading bang submit to bash intent before downstream dispatch', async () => {
    const events: string[] = []

    await dispatchReplSubmit(
      makeBaseOptions({
        input: '!echo hi',
        inputMode: 'prompt',
        getInputValue: () => '!echo hi',
        commands: [],
      }),
      {
        preludeDeps: {} as ReplSubmitPreludeDispatchDeps,
        bookkeepingDeps: {} as ReplSubmitBookkeepingDispatchDeps,
        postBookkeepingDeps: {} as DispatchReplPostBookkeepingSubmitDeps,
        dispatchReplSubmitPreludeImpl: async options => {
          events.push(`prelude:${options.input}:${options.promptInputMode}`)
          return false
        },
        dispatchReplSubmitBookkeepingImpl: ({ input, inputMode }) => {
          events.push(`bookkeeping:${input}:${inputMode}`)
        },
        dispatchReplPostBookkeepingSubmitImpl: async options => {
          events.push(`post:${options.input}:${options.inputMode}`)
          return 'leader'
        },
      },
    )

    expect(events).toEqual([
      'prelude:echo hi:bash',
      'bookkeeping:echo hi:bash',
      'post:echo hi:bash',
    ])
  })
})
