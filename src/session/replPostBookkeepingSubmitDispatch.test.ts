import { describe, expect, mock, test } from 'bun:test'
import type { Message } from '../types/message.js'
import { dispatchReplPostBookkeepingSubmit } from './replPostBookkeepingSubmitDispatch.js'

function createBaseArgs() {
  return {
    input: 'hello',
    pastedContents: {},
    mainLoopModel: 'gpt-test',
    cwd: '/tmp/work',
    readFileState: { current: new Map() } as never,
    speculationAccept: undefined,
    inputMode: 'prompt' as const,
    commands: [],
    ideSelection: undefined,
    stashedPrompt: undefined,
    shouldProvideDeferredStashRestore: false,
    abortController: null,
    isExternalLoading: false,
    streamMode: 'dots' as never,
    hasInterruptibleToolInProgress: false,
    isRemoteMode: false,
    isSlashCommand: false,
    matchedCommandType: undefined,
    querySource: 'repl' as const,
  }
}

function createBaseDeps() {
  return {
    awaitPendingHooks: mock(async () => {}),
    helpers: {
      setCursorOffset: mock(() => {}),
    },
    queryGuard: {
      tryStart: mock(() => true),
      end: mock(() => {}),
      isActive: false,
    } as never,
    setInputValue: mock(() => {}),
    setPastedContents: mock(() => {}),
    clearStashedPrompt: mock(() => {}),
    setToolJSX: mock(() => {}),
    getToolUseContext: mock(() => ({})) as never,
    getMessages: () => [{ uuid: 'm1' } as Message],
    setUserInputOnProcessing: mock(() => {}),
    setAbortController: mock(() => {}),
    onQuery: mock(async () => {}),
    setAppState: mock(() => {}) as never,
    onBeforeQuery: mock(async () => {}) as never,
    canUseTool: mock(async () => true) as never,
    addNotification: mock(() => {}),
    setMessages: mock(() => {}) as never,
    createAbortController: () => new AbortController(),
    activeRemoteSendMessage: mock(async () => {}),
  }
}

describe('dispatchReplPostBookkeepingSubmit', () => {
  test('only wires remote submit when the existing remote policy allows it', async () => {
    const dispatchPostBookkeepingSubmitImpl = mock(async () => 'remote' as const)
    const args = createBaseArgs()
    const deps = createBaseDeps()

    await dispatchReplPostBookkeepingSubmit(
      {
        ...args,
        isRemoteMode: true,
        isSlashCommand: false,
      },
      {
        ...deps,
        dispatchPostBookkeepingSubmitImpl,
      },
    )

    const remoteAllowedCall = dispatchPostBookkeepingSubmitImpl.mock.calls[0]
    expect(remoteAllowedCall?.[1]?.remoteSubmit).toBeDefined()

    dispatchPostBookkeepingSubmitImpl.mockClear()

    await dispatchReplPostBookkeepingSubmit(
      {
        ...args,
        input: '/config',
        isRemoteMode: true,
        isSlashCommand: true,
        matchedCommandType: 'local-jsx',
      },
      {
        ...deps,
        dispatchPostBookkeepingSubmitImpl,
      },
    )

    const remoteBlockedCall = dispatchPostBookkeepingSubmitImpl.mock.calls[0]
    expect(remoteBlockedCall?.[1]?.remoteSubmit).toBeUndefined()
  })

  test('preserves deferred stash restore semantics for the leader path', async () => {
    const dispatchPostBookkeepingSubmitImpl = mock(
      async (options: any) => {
        options.leaderSubmit.restoreDeferredStash?.()
        return 'leader' as const
      },
    )
    const deps = createBaseDeps()

    await dispatchReplPostBookkeepingSubmit(
      {
        ...createBaseArgs(),
        stashedPrompt: {
          text: 'stashed input',
          cursorOffset: 7,
          pastedContents: { 1: { id: 1, type: 'text', content: 'pasted' } },
        },
        shouldProvideDeferredStashRestore: true,
      },
      {
        ...deps,
        dispatchPostBookkeepingSubmitImpl,
      },
    )

    expect(deps.setInputValue).toHaveBeenCalledWith('stashed input')
    expect(deps.helpers.setCursorOffset).toHaveBeenCalledWith(7)
    expect(deps.setPastedContents).toHaveBeenCalledWith({
      1: { id: 1, type: 'text', content: 'pasted' },
    })
    expect(deps.clearStashedPrompt).toHaveBeenCalledTimes(1)
  })
})
