import { afterEach, describe, expect, mock, test } from 'bun:test'
import type { BashCall } from '../tools/BashTool/BashTool.js'
import { BashTool } from '../tools/BashTool/BashTool.js'

afterEach(() => {
  mock.restore()
})

async function buildMockedSubmit(env?: {
  processUserInputReturn?: Awaited<
    ReturnType<typeof import('./processUserInput/processUserInput.js').processUserInput>
  >
}): Promise<{
  handlePromptSubmit: typeof import('./handlePromptSubmit.js').handlePromptSubmit
  events: string[]
}> {
  const processUserInputPaths = [
    import.meta.resolve('./processUserInput/processUserInput.ts'),
    import.meta.resolve('./processUserInput/processUserInput.js'),
  ]
  const actualProcessUserInputModule = await import(
    import.meta.resolve('./processUserInput/processUserInput.ts')
  )

  for (const path of processUserInputPaths) {
    mock.module(path, () => ({
      ...actualProcessUserInputModule,
      processUserInput: async () =>
        env?.processUserInputReturn ?? {
          messages: [],
          shouldQuery: true,
          allowedTools: ['Bash'],
          model: undefined,
          effort: undefined,
          nextInput: undefined,
          submitNextInput: undefined,
        },
    }))
  }

  const { handlePromptSubmit } = await import('./handlePromptSubmit.js')

  return { handlePromptSubmit, events: [] }
}

let originalBashCall: BashCall

function stubBashTool(returnValue: Awaited<ReturnType<BashCall>> | ShellError): void {
  originalBashCall = BashTool.call
  ;(BashTool as { call: BashCall }).call = (async () => {
    if (returnValue instanceof Error) throw returnValue
    return returnValue
  }) as BashCall
}

afterEach(() => {
  if (originalBashCall !== undefined) {
    ;(BashTool as { call: BashCall }).call = originalBashCall
  }
})

describe('handlePromptSubmit plain prompt query path', () => {
  test('forwards a real prompt to onQuery with shouldQuery=true when processUserInput requests a query', async () => {
    const userMessage = {
      type: 'user',
      uuid: 'u1',
      isMeta: false,
      message: {
        role: 'user',
        content: 'hello world',
      },
    } as any

    const { handlePromptSubmit, events } = await buildMockedSubmit({
      processUserInputReturn: {
        messages: [userMessage],
        shouldQuery: true,
        allowedTools: ['Bash'],
        model: undefined,
        effort: undefined,
        nextInput: undefined,
        submitNextInput: undefined,
      },
    })

    await handlePromptSubmit({
      input: 'hello world',
      mode: 'prompt',
      helpers: {
        setCursorOffset: () => {},
        clearBuffer: () => {},
        resetHistory: () => {},
      },
      onInputChange: () => {},
      setPastedContents: () => {},
      queryGuard: {
        isActive: false,
        reserve: () => {
          events.push('reserve')
        },
        cancelReservation: () => {
          events.push('cancel')
        },
      } as never,
      isExternalLoading: false,
      commands: [],
      setToolJSX: () => {},
      getToolUseContext: () => ({ options: {} } as never),
      messages: [],
      mainLoopModel: 'gpt-test',
      ideSelection: undefined,
      setUserInputOnProcessing: () => {},
      setAbortController: controller => {
        events.push(`setAbort:${String(controller instanceof AbortController)}`)
      },
      onQuery: async (
        newMessages,
        _abortController,
        shouldQuery,
        additionalAllowedTools,
        mainLoopModel,
      ) => {
        events.push(
          `onQuery:${newMessages.length}:${String(shouldQuery)}:${additionalAllowedTools.join(',')}:${mainLoopModel}`,
        )
      },
      setAppState: () => ({} as never),
      querySource: 'repl',
    })

    expect(events).toEqual([
      'setAbort:true',
      'reserve',
      'onQuery:1:true:Bash:gpt-test',
      'cancel',
    ])
  })

  test('bash mode with empty input does not early-return; submits empty command', async () => {
    const { handlePromptSubmit, events } = await buildMockedSubmit({
      processUserInputReturn: {
        messages: [],
        shouldQuery: false,
        allowedTools: ['Bash'],
        model: undefined,
        effort: undefined,
        nextInput: undefined,
        submitNextInput: undefined,
      },
    })

    let capturedInput: string | undefined

    await handlePromptSubmit({
      input: '',
      mode: 'bash',
      helpers: {
        setCursorOffset: () => {},
        clearBuffer: () => {
          events.push('clearBuffer')
        },
        resetHistory: () => {},
      },
      onInputChange: (v: string) => {
        capturedInput = v
      },
      setPastedContents: () => {},
      queryGuard: {
        isActive: false,
        reserve: () => {
          events.push('reserve')
        },
        cancelReservation: () => {
          events.push('cancel')
        },
      } as never,
      isExternalLoading: false,
      commands: [],
      setToolJSX: () => {},
      getToolUseContext: () => ({ options: {} } as never),
      messages: [],
      mainLoopModel: 'gpt-test',
      ideSelection: undefined,
      setUserInputOnProcessing: () => {},
      setAbortController: controller => {
        events.push(`setAbort:${String(controller instanceof AbortController)}`)
      },
      onQuery: async () => {},
      setAppState: () => ({} as never),
      querySource: 'repl',
    })

    expect(events).toEqual([
      'setAbort:true',
      'reserve',
      'cancel',
      'setAbort:false',
      'cancel',
    ])
    expect(capturedInput).toBeUndefined()
  })
})

describe('handlePromptSubmit bash integration (real processUserInput, mocked BashTool)', () => {
  test('empty bash input reaches onQuery with bash messages, not early-return', async () => {
    stubBashTool({
      data: {
        stdout: '',
        stderr: '',
        interrupted: false,
        isImage: false,
        noOutputExpected: false,
      },
    })

    const { handlePromptSubmit } = await import('./handlePromptSubmit.js')

    const events: string[] = []
    const onQueryMessages: any[] = []

    await handlePromptSubmit({
      input: '',
      mode: 'bash',
      helpers: {
        setCursorOffset: () => {},
        clearBuffer: () => {},
        resetHistory: () => {},
      },
      onInputChange: () => {},
      setPastedContents: () => {},
      queryGuard: {
        isActive: false,
        reserve: () => {
          events.push('reserve')
        },
        cancelReservation: () => {
          events.push('cancel')
        },
      } as never,
      isExternalLoading: false,
      commands: [],
      setToolJSX: () => {},
      getToolUseContext: () =>
        ({
          options: { verbose: false },
          readFileState: { current: {} },
          getAppState: () => ({
            toolPermissionContext: {
              permissions: [],
              disabledCommands: [],
              allowAll: false,
            },
          }),
          setAppState: () => {},
          setMessages: () => {},
          onChangeAPIKey: () => {},
        } as never),
      messages: [],
      mainLoopModel: 'gpt-test',
      ideSelection: undefined,
      setUserInputOnProcessing: () => {},
      setAbortController: controller => {
        events.push(`setAbort:${String(controller instanceof AbortController)}`)
      },
      onQuery: async (
        newMessages,
        _abortController,
        shouldQuery,
        additionalAllowedTools,
        mainLoopModel,
      ) => {
        events.push(
          `onQuery:${newMessages.length}:${String(shouldQuery)}:${additionalAllowedTools.join(',')}:${mainLoopModel}`,
        )
        onQueryMessages.push(...newMessages)
      },
      setAppState: () => ({} as never),
      querySource: 'repl',
    })

    expect(events).toEqual([
      'setAbort:true',
      'reserve',
      'cancel',
      'setAbort:false',
      'cancel',
    ])

    expect(onQueryMessages).toHaveLength(0)
  })

  test('non-empty bash input strips leading ! and produces bash messages', async () => {
    stubBashTool({
      data: {
        stdout: 'hello',
        stderr: '',
        interrupted: false,
        isImage: false,
        noOutputExpected: false,
      },
    })

    const { handlePromptSubmit } = await import('./handlePromptSubmit.js')

    const events: string[] = []
    const onQueryMessages: any[] = []

    await handlePromptSubmit({
      input: '!echo hi',
      mode: 'bash',
      helpers: {
        setCursorOffset: () => {},
        clearBuffer: () => {},
        resetHistory: () => {},
      },
      onInputChange: () => {},
      setPastedContents: () => {},
      queryGuard: {
        isActive: false,
        reserve: () => {
          events.push('reserve')
        },
        cancelReservation: () => {
          events.push('cancel')
        },
      } as never,
      isExternalLoading: false,
      commands: [],
      setToolJSX: () => {},
      getToolUseContext: () =>
        ({
          options: { verbose: false },
          readFileState: { current: {} },
          getAppState: () => ({
            toolPermissionContext: {
              permissions: [],
              disabledCommands: [],
              allowAll: false,
            },
          }),
          setAppState: () => {},
          setMessages: () => {},
          onChangeAPIKey: () => {},
        } as never),
      messages: [],
      mainLoopModel: 'gpt-test',
      ideSelection: undefined,
      setUserInputOnProcessing: () => {},
      setAbortController: controller => {
        events.push(`setAbort:${String(controller instanceof AbortController)}`)
      },
      onQuery: async (
        newMessages,
        _abortController,
        shouldQuery,
        additionalAllowedTools,
        mainLoopModel,
      ) => {
        events.push(
          `onQuery:${newMessages.length}:${String(shouldQuery)}:${additionalAllowedTools.join(',')}:${mainLoopModel}`,
        )
        onQueryMessages.push(...newMessages)
      },
      setAppState: () => ({} as never),
      querySource: 'repl',
    })

    expect(events).toEqual([
      'setAbort:true',
      'reserve',
      'cancel',
      'setAbort:false',
      'cancel',
    ])

    expect(onQueryMessages).toHaveLength(0)
  })
})
