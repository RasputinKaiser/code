import { describe, expect, test } from 'bun:test'
import type { Command } from '../commands.js'
import { dispatchReplSubmitPrelude } from './replSubmitPreludeDispatch.js'

function makeCommand(name: string): Command {
  return {
    name,
    description: `${name} command`,
    type: 'local-jsx',
  } as unknown as Command
}

function makeBaseDeps() {
  const events: string[] = []
  const deps = {
    addNotification: (notification: {
      key: string
      text: string
      priority: 'immediate'
      timeoutMs: number
    }) => {
      events.push(`notify:${notification.key}`)
    },
    addToHistory: () => {
      events.push('history')
    },
    setInputValue: (value: string) => {
      events.push(`input:${value}`)
    },
    setPastedContents: () => {
      events.push('pasted')
    },
    setInputMode: () => {
      events.push('mode')
    },
    setIDESelection: () => {
      events.push('ide')
    },
    incrementSubmitCount: () => {
      events.push('submit:inc')
    },
    createAbortController: () => new AbortController(),
    getMessages: () => [],
    getToolUseContext: () => undefined,
    setMessages: () => {
      events.push('messages')
    },
    setStashedPrompt: () => {
      events.push('stash')
    },
    setToolJSX: () => {
      events.push('tooljsx')
    },
    logEvent: (name: string) => {
      events.push(`log:${name}`)
    },
    addIdleReturnPending: (value: { input: string; idleMinutes: number }) => {
      events.push(`idle:${value.input}:${value.idleMinutes}`)
    },
    clearIdleHint: () => {
      events.push('idle:clear')
    },
    getIdleHint: () => false as string | false,
    isFullscreenEnvEnabled: () => true,
  }
  return { deps, events }
}

describe('dispatchReplSubmitPrelude', () => {
  test('short-circuits with the empty background PR notification', async () => {
    const { deps, events } = makeBaseDeps()
    const handled = await dispatchReplSubmitPrelude(
      {
        submitPreludePlan: { type: 'background-pr-empty-prompt' },
        shouldAddToHistory: true,
        input: '&',
        pastedContents: {},
        getInputValue: () => '&',
        helpers: {
          setCursorOffset: () => {
            events.push('cursor')
          },
          clearBuffer: () => {
            events.push('buffer')
          },
        },
        promptInputMode: 'prompt',
        matchingSubmitCommand: undefined,
        fromKeybinding: false,
        mainLoopModel: 'gpt-test',
        stashedPrompt: undefined,
        totalInputTokens: 0,
        nowMs: 1_000,
        lastQueryCompletionTimeMs: 0,
        messageCount: 0,
      },
      deps,
    )

    expect(handled).toBe(true)
    expect(events).toEqual(['notify:suggest-background-pr-empty'])
  })

  test('dispatches background PR prelaunch and short-circuits', async () => {
    const { deps, events } = makeBaseDeps()
    let launchedPrompt: string | null = null

    const handled = await dispatchReplSubmitPrelude(
      {
        submitPreludePlan: { type: 'background-pr-launch', prompt: 'ship it' },
        shouldAddToHistory: true,
        input: '& ship it',
        pastedContents: {},
        getInputValue: () => '& ship it',
        helpers: {
          setCursorOffset: () => {
            events.push('cursor')
          },
          clearBuffer: () => {
            events.push('buffer')
          },
        },
        promptInputMode: 'prompt',
        matchingSubmitCommand: undefined,
        fromKeybinding: false,
        mainLoopModel: 'gpt-test',
        stashedPrompt: undefined,
        totalInputTokens: 0,
        nowMs: 1_000,
        lastQueryCompletionTimeMs: 0,
        messageCount: 0,
      },
      {
        ...deps,
        dispatchBackgroundPrShortcutPrelaunchImpl: async options => {
          launchedPrompt = options.prompt
          events.push('background:launch')
        },
      },
    )

    expect(handled).toBe(true)
    expect(launchedPrompt).toBe('ship it')
    expect(events).toContain('background:launch')
  })

  test('preserves clear-idle-hint logging and immediate local JSX dispatch ordering', async () => {
    const { deps, events } = makeBaseDeps()
    const command = makeCommand('clear')
    let immediateDispatchCalled = false

    const handled = await dispatchReplSubmitPrelude(
      {
        submitPreludePlan: { type: 'immediate-local-jsx', commandArgs: '' },
        shouldAddToHistory: false,
        input: '/clear',
        pastedContents: {},
        getInputValue: () => '/clear',
        helpers: {
          setCursorOffset: () => {
            events.push('cursor')
          },
          clearBuffer: () => {
            events.push('buffer')
          },
        },
        promptInputMode: 'prompt',
        matchingSubmitCommand: command,
        fromKeybinding: false,
        mainLoopModel: 'gpt-test',
        stashedPrompt: undefined,
        totalInputTokens: 42,
        nowMs: 120_000,
        lastQueryCompletionTimeMs: 0,
        messageCount: 7,
      },
      {
        ...deps,
        getIdleHint: () => 'willow',
        dispatchImmediateLocalJsxSubmitImpl: () => {
          immediateDispatchCalled = true
          events.push('local-jsx:dispatch')
        },
      },
    )

    expect(handled).toBe(true)
    expect(immediateDispatchCalled).toBe(true)
    expect(events).toEqual([
      'log:ncode_idle_return_action',
      'idle:clear',
      'local-jsx:dispatch',
    ])
  })

  test('returns false when idle-return dialog preflight does not open', async () => {
    const { deps, events } = makeBaseDeps()

    const handled = await dispatchReplSubmitPrelude(
      {
        submitPreludePlan: {
          type: 'idle-return-dialog',
          preflight: {
            shouldOpenDialog: true,
            idleMinutes: 10,
          },
        },
        shouldAddToHistory: false,
        input: 'continue',
        pastedContents: {},
        getInputValue: () => 'continue',
        helpers: {
          setCursorOffset: () => {
            events.push('cursor')
          },
          clearBuffer: () => {
            events.push('buffer')
          },
        },
        promptInputMode: 'prompt',
        matchingSubmitCommand: undefined,
        fromKeybinding: false,
        mainLoopModel: 'gpt-test',
        stashedPrompt: undefined,
        totalInputTokens: 0,
        nowMs: 0,
        lastQueryCompletionTimeMs: 0,
        messageCount: 0,
      },
      {
        ...deps,
        dispatchReplIdleReturnDialogImpl: () => false,
      },
    )

    expect(handled).toBe(false)
    expect(events).toEqual([])
  })
})
