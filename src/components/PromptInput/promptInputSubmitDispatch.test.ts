import { describe, expect, test } from 'bun:test'
import { dispatchPromptInputSubmit } from './promptInputSubmitDispatch.js'

function makeOptions(overrides: Record<string, unknown> = {}) {
  return {
    inputParam: '  hello  ',
    inputMode: 'prompt',
    footerSelectionVisible: false,
    viewSelectionMode: null,
    hasImages: false,
    suggestions: [],
    isSubmittingSlashCommand: false,
    promptSuggestionState: {
      text: '',
      shownAt: undefined,
    },
    viewingAgentTaskId: null,
    speculationStatus: 'idle',
    helpers: {
      setCursorOffset: () => {},
      clearBuffer: () => {},
      resetHistory: () => {},
    },
    speculation: {} as never,
    speculationSessionTimeSavedMs: 0,
    setAppState: (() => {}) as never,
    swarmsEnabled: false,
    teamContext: undefined,
    activeAgent: {
      type: 'leader',
    },
    ...overrides,
  } as const
}

function makeDeps(events: string[] = []) {
  return {
    submitIntentDeps: {
      markAccepted: () => {
        events.push('mark-accepted')
      },
      logOutcomeAtSubmission: (input: string) => {
        events.push(`log:${input}`)
      },
      onSubmitProp: async (input: string) => {
        events.push(`submit:${input}`)
      },
    },
    directMessageDeps: {
      addNotification: () => {
        events.push('notify')
      },
      clearDraft: () => {
        events.push('clear-draft')
      },
    },
    agentRouteDeps: {
      helpers: {
        setCursorOffset: () => {},
        clearBuffer: () => {},
        resetHistory: () => {},
      },
      onAgentSubmit: async () => {
        events.push('agent-submit')
      },
      onRouted: () => {
        events.push('agent-routed')
      },
    },
    removeNotification: (key: string) => {
      events.push(`remove:${key}`)
    },
    onSubmitProp: async (input: string) => {
      events.push(`leader-submit:${input}`)
    },
  }
}

describe('dispatchPromptInputSubmit', () => {
  test('returns immediately when the submit plan is blocked', async () => {
    const events: string[] = []

    await dispatchPromptInputSubmit(makeOptions(), {
      ...makeDeps(events),
      resolvePromptInputSubmitPlanImpl: () => ({
        kind: 'blocked',
        reason: 'footer_selected',
      }),
    })

    expect(events).toEqual([])
  })

  test('short-circuits when suggestion submit handling consumes the submit', async () => {
    const events: string[] = []

    await dispatchPromptInputSubmit(makeOptions(), {
      ...makeDeps(events),
      resolvePromptInputSubmitPlanImpl: () => ({
        kind: 'proceed',
        inputToSubmit: 'hello',
        promptSuggestionIntent: { kind: 'none', inputToSubmit: 'hello' },
        shouldLogPromptSuggestionOutcome: false,
      }),
      dispatchPromptInputSubmitIntentImpl: async () => ({
        handled: true,
      }),
      dispatchPromptInputDirectMessageShortcutImpl: async () => {
        events.push('direct-message')
        return false
      },
      dispatchPromptInputAgentRouteImpl: async () => {
        events.push('agent-route')
        return false
      },
    })

    expect(events).toEqual([])
  })

  test('short-circuits on direct message before stash-hint removal and leader submit', async () => {
    const events: string[] = []

    await dispatchPromptInputSubmit(makeOptions(), {
      ...makeDeps(events),
      resolvePromptInputSubmitPlanImpl: () => ({
        kind: 'proceed',
        inputToSubmit: 'hello',
        promptSuggestionIntent: { kind: 'none', inputToSubmit: 'hello' },
        shouldLogPromptSuggestionOutcome: true,
      }),
      dispatchPromptInputSubmitIntentImpl: async () => ({
        handled: false,
        nextInput: 'hello',
      }),
      dispatchPromptInputDirectMessageShortcutImpl: async () => {
        events.push('direct-message')
        return true
      },
      dispatchPromptInputAgentRouteImpl: async () => {
        events.push('agent-route')
        return false
      },
    })

    expect(events).toEqual(['direct-message'])
  })

  test('short-circuits on agent route after stash-hint removal and logging', async () => {
    const events: string[] = []

    await dispatchPromptInputSubmit(makeOptions(), {
      ...makeDeps(events),
      resolvePromptInputSubmitPlanImpl: () => ({
        kind: 'proceed',
        inputToSubmit: 'hello',
        promptSuggestionIntent: { kind: 'none', inputToSubmit: 'hello' },
        shouldLogPromptSuggestionOutcome: true,
      }),
      dispatchPromptInputSubmitIntentImpl: async () => ({
        handled: false,
        nextInput: 'hello',
      }),
      dispatchPromptInputDirectMessageShortcutImpl: async () => {
        events.push('direct-message')
        return false
      },
      dispatchPromptInputAgentRouteImpl: async () => {
        events.push('agent-route')
        return true
      },
    })

    expect(events).toEqual([
      'direct-message',
      'log:hello',
      'remove:stash-hint',
      'agent-route',
    ])
  })

  test('empty input is blocked regardless of inputMode', async () => {
    // Regression guard: empty submits are blocked for all modes,
    // including bash. A bare '!' switches mode but has no command
    // to run; the user must type the command before Enter works.

    const eventsMissingMode: string[] = []
    await dispatchPromptInputSubmit(
      makeOptions({
        inputParam: '',
        // Deliberately omit inputMode to simulate old PromptInput.tsx
        inputMode: undefined as unknown as string,
      }),
      {
        ...makeDeps(eventsMissingMode),
        resolvePromptInputSubmitPlanImpl: undefined,
        dispatchPromptInputSubmitIntentImpl: async () => ({
          handled: false,
          nextInput: '',
        }),
        dispatchPromptInputDirectMessageShortcutImpl: async () => false,
        dispatchPromptInputAgentRouteImpl: async () => false,
      },
    )
    expect(eventsMissingMode).not.toContain('leader-submit:')

    const eventsBashEmpty: string[] = []
    await dispatchPromptInputSubmit(
      makeOptions({ inputParam: '', inputMode: 'bash' }),
      {
        ...makeDeps(eventsBashEmpty),
        resolvePromptInputSubmitPlanImpl: undefined,
        dispatchPromptInputSubmitIntentImpl: async () => ({
          handled: false,
          nextInput: '',
        }),
        dispatchPromptInputDirectMessageShortcutImpl: async () => false,
        dispatchPromptInputAgentRouteImpl: async () => false,
      },
    )
    expect(eventsBashEmpty).toEqual([
      'remove:stash-hint',
      'leader-submit:',
    ])
  })

  test('submits trimmed input to the leader path after logging and stash-hint removal', async () => {
    const events: string[] = []

    await dispatchPromptInputSubmit(makeOptions(), {
      ...makeDeps(events),
      resolvePromptInputSubmitPlanImpl: input => ({
        kind: 'proceed',
        inputToSubmit: input.inputParam,
        promptSuggestionIntent: {
          kind: 'none',
          inputToSubmit: input.inputParam,
        },
        shouldLogPromptSuggestionOutcome: true,
      }),
      dispatchPromptInputSubmitIntentImpl: async ({ inputToSubmit }) => ({
        handled: false,
        nextInput: inputToSubmit,
      }),
      dispatchPromptInputDirectMessageShortcutImpl: async () => {
        events.push('direct-message')
        return false
      },
      dispatchPromptInputAgentRouteImpl: async () => {
        events.push('agent-route')
        return false
      },
    })

    expect(events).toEqual([
      'direct-message',
      'log:  hello',
      'remove:stash-hint',
      'agent-route',
      'leader-submit:  hello',
    ])
  })
})
