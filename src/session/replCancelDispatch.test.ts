import { describe, expect, test } from 'bun:test'

import { createUserMessage } from '../utils/messages.js'
import { dispatchReplCancel } from './replCancelDispatch.js'

describe('dispatchReplCancel', () => {
  test('elicitation dialog no-ops without touching cancel side effects', () => {
    const events: string[] = []

    dispatchReplCancel(
      {
        focusedInputDialog: 'elicitation',
        streamMode: 'stream',
        streamingText: 'partial',
        promptQueue: [],
        proactiveEnabled: true,
        tokenBudgetEnabled: true,
        isRemoteMode: true,
      },
      {
        logDebug: () => {
          events.push('log')
        },
        pauseProactive: () => {
          events.push('pause')
        },
        forceEndQueryGuard: () => {
          events.push('guard')
        },
        markSkipIdleCheckFalse: () => {
          events.push('idle')
        },
        setMessages: () => {
          events.push('messages')
        },
        resetLoadingState: () => {
          events.push('reset')
        },
        clearTokenBudgetSnapshot: () => {
          events.push('token')
        },
        abortToolUseConfirmRequest: () => {
          events.push('tool-abort')
        },
        clearToolUseConfirmQueue: () => {
          events.push('tool-clear')
        },
        clearPromptQueue: () => {
          events.push('prompt-clear')
        },
        abortController: null,
        cancelRemoteRequest: () => {
          events.push('remote-cancel')
        },
        setAbortController: () => {
          events.push('set-abort')
        },
        getCurrentMessages: () => [],
        completeTurnAsAborted: () => {
          events.push('complete')
        },
      },
    )

    expect(events).toEqual([])
  })

  test('prompt cancel preserves ordering and prompt queue rejection semantics', () => {
    const events: string[] = []
    const abortController = new AbortController()
    let messages = [createUserMessage({ content: 'start' })]

    dispatchReplCancel(
      {
        focusedInputDialog: 'prompt',
        streamMode: 'stream-json',
        streamingText: 'partially streamed assistant text',
        promptQueue: [
          {
            reject: reason => {
              events.push(`reject-1:${reason.message}`)
            },
          },
          {
            reject: reason => {
              events.push(`reject-2:${reason.message}`)
            },
          },
        ],
        proactiveEnabled: true,
        tokenBudgetEnabled: true,
        isRemoteMode: false,
      },
      {
        logDebug: message => {
          events.push(`log:${message.includes('focusedInputDialog=prompt')}`)
        },
        pauseProactive: () => {
          events.push('pause')
        },
        forceEndQueryGuard: () => {
          events.push('guard')
        },
        markSkipIdleCheckFalse: () => {
          events.push('idle')
        },
        setMessages: updater => {
          messages = updater(messages)
          events.push(`messages:${messages.length}`)
        },
        resetLoadingState: () => {
          events.push('reset')
        },
        clearTokenBudgetSnapshot: () => {
          events.push('token')
        },
        abortToolUseConfirmRequest: () => {
          events.push('tool-abort')
        },
        clearToolUseConfirmQueue: () => {
          events.push('tool-clear')
        },
        clearPromptQueue: () => {
          events.push('prompt-clear')
        },
        abortController,
        cancelRemoteRequest: () => {
          events.push('remote-cancel')
        },
        setAbortController: controller => {
          events.push(`set-abort:${controller === null}`)
        },
        getCurrentMessages: () => messages,
        completeTurnAsAborted: current => {
          events.push(`complete:${current.length}`)
        },
      },
    )

    expect(events).toEqual([
      'log:true',
      'pause',
      'guard',
      'idle',
      'messages:2',
      'reset',
      'token',
      'reject-1:Prompt cancelled by user',
      'reject-2:Prompt cancelled by user',
      'prompt-clear',
      'set-abort:true',
      'complete:2',
    ])
    expect(abortController.signal.aborted).toBe(true)
  })

  test('tool-permission cancel aborts tool request without aborting the query controller', () => {
    const events: string[] = []
    const abortController = new AbortController()

    dispatchReplCancel(
      {
        focusedInputDialog: 'tool-permission',
        streamMode: undefined,
        streamingText: '   ',
        promptQueue: [],
        proactiveEnabled: false,
        tokenBudgetEnabled: false,
        isRemoteMode: false,
      },
      {
        logDebug: () => {
          events.push('log')
        },
        pauseProactive: () => {
          events.push('pause')
        },
        forceEndQueryGuard: () => {
          events.push('guard')
        },
        markSkipIdleCheckFalse: () => {
          events.push('idle')
        },
        setMessages: () => {
          events.push('messages')
        },
        resetLoadingState: () => {
          events.push('reset')
        },
        clearTokenBudgetSnapshot: () => {
          events.push('token')
        },
        abortToolUseConfirmRequest: () => {
          events.push('tool-abort')
        },
        clearToolUseConfirmQueue: () => {
          events.push('tool-clear')
        },
        clearPromptQueue: () => {
          events.push('prompt-clear')
        },
        abortController,
        cancelRemoteRequest: () => {
          events.push('remote-cancel')
        },
        setAbortController: controller => {
          events.push(`set-abort:${controller === null}`)
        },
        getCurrentMessages: () => [],
        completeTurnAsAborted: () => {
          events.push('complete')
        },
      },
    )

    expect(events).toEqual([
      'log',
      'guard',
      'idle',
      'reset',
      'tool-abort',
      'tool-clear',
      'set-abort:true',
      'complete',
    ])
    expect(abortController.signal.aborted).toBe(false)
  })

  test('remote mode cancel routes interrupt to remote request channel', () => {
    const events: string[] = []
    const abortController = new AbortController()

    dispatchReplCancel(
      {
        focusedInputDialog: undefined,
        streamMode: undefined,
        streamingText: null,
        promptQueue: [],
        proactiveEnabled: false,
        tokenBudgetEnabled: false,
        isRemoteMode: true,
      },
      {
        logDebug: () => {
          events.push('log')
        },
        pauseProactive: () => {
          events.push('pause')
        },
        forceEndQueryGuard: () => {
          events.push('guard')
        },
        markSkipIdleCheckFalse: () => {
          events.push('idle')
        },
        setMessages: () => {
          events.push('messages')
        },
        resetLoadingState: () => {
          events.push('reset')
        },
        clearTokenBudgetSnapshot: () => {
          events.push('token')
        },
        abortToolUseConfirmRequest: () => {
          events.push('tool-abort')
        },
        clearToolUseConfirmQueue: () => {
          events.push('tool-clear')
        },
        clearPromptQueue: () => {
          events.push('prompt-clear')
        },
        abortController,
        cancelRemoteRequest: () => {
          events.push('remote-cancel')
        },
        setAbortController: controller => {
          events.push(`set-abort:${controller === null}`)
        },
        getCurrentMessages: () => [],
        completeTurnAsAborted: () => {
          events.push('complete')
        },
      },
    )

    expect(events).toEqual([
      'log',
      'guard',
      'idle',
      'reset',
      'remote-cancel',
      'set-abort:true',
      'complete',
    ])
    expect(abortController.signal.aborted).toBe(false)
  })
})
