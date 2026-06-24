import { afterEach, describe, expect, test, mock } from 'bun:test'

import type { QueuedCommand } from '../types/textInputTypes.js'

afterEach(() => {
  mock.restore()
})

describe('dispatchReplQueuedInput', () => {
  test('packages queued commands through handlePromptSubmit with inert prompt helpers', async () => {
    const queuedCommands = [
      {
        prompt: 'run queued command',
        priority: 'next',
        source: 'user',
      } as QueuedCommand,
    ]

    const events: string[] = []
    const handlePromptSubmitPaths = [
      import.meta.resolve('../utils/handlePromptSubmit.ts'),
      import.meta.resolve('../utils/handlePromptSubmit.js'),
    ]
    const actualHandlePromptSubmit = await import(
      import.meta.resolve('../utils/handlePromptSubmit.ts')
    )

    for (const handlePromptSubmitPath of handlePromptSubmitPaths) {
      mock.module(handlePromptSubmitPath, () => ({
        ...actualHandlePromptSubmit,
        handlePromptSubmit: async (params: any) => {
          params.helpers.setCursorOffset(10)
          params.helpers.clearBuffer()
          params.helpers.resetHistory()

          events.push(`queued:${params.queuedCommands?.length ?? 0}`)
          events.push(`query-source:${params.querySource}`)
          events.push(`messages:${params.messages.length}`)
        },
      }))
    }

    const { dispatchReplQueuedInput } = await import('./replQueuedInputDispatch.js')

    await dispatchReplQueuedInput({
        queuedCommands,
        queryGuard: {} as never,
        commands: [] as never,
        setToolJSX: (() => {}) as never,
        getToolUseContext: (() => ({})) as never,
        messages: [{ uuid: 'm1' }] as never,
        mainLoopModel: 'model-x',
        ideSelection: undefined,
        setUserInputOnProcessing: () => {},
        setAbortController: () => {},
        onQuery: async () => {},
        setAppState: updater => updater as never,
        querySource: 'repl' as never,
        onBeforeQuery: undefined,
        canUseTool: undefined,
        addNotification: undefined,
        setMessages: undefined,
      })

    expect(events).toEqual([
      'queued:1',
      'query-source:repl',
      'messages:1',
    ])
  })
})
