import { describe, expect, mock, test } from 'bun:test'
import { dispatchReplMessageSelectorSummarize } from './replMessageSelectorDispatch.js'
import type { Message, UserMessage } from '../types/message.js'

function userMessage(uuid: string): UserMessage {
  return {
    uuid,
    type: 'user',
    message: {
      role: 'user',
      content: 'hello',
    },
  } as UserMessage
}

function systemMessage(uuid: string): Message {
  return {
    uuid,
    type: 'system',
    message: 'system',
    level: 'info',
  } as unknown as Message
}

describe('dispatchReplMessageSelectorSummarize', () => {
  test('warns and exits when the selected message is no longer in the active compact context', async () => {
    const message = userMessage('u1')
    const appendActiveContextWarning = mock(() => {})

    await dispatchReplMessageSelectorSummarize(message, undefined, 'from', {
      messages: [message],
      getMessagesAfterCompactBoundary: () => [userMessage('other')],
      appendActiveContextWarning,
      createAbortController: mock(() => new AbortController()),
      buildToolUseContext: mock(() => ({ options: {} }) as never),
      buildRenderedSystemPrompt: mock(async () => 'unused'),
      getUserContext: mock(async () => ({})),
      getSystemContext: mock(async () => ({})),
      partialCompactConversation: mock(async () => {
        throw new Error('should not compact when message is out of context')
      }),
      isFullscreenEnvEnabled: () => true,
      setMessages: mock(() => {}),
      clearContextBlockedIfNeeded: mock(() => {}),
      setConversationId: mock(() => {}),
      generateConversationId: () => 'new-session',
      onTranscriptReset: mock(() => {}),
      runPostCompactCleanup: mock(() => {}),
      textForResubmit: mock(() => null),
      setInputValue: mock(() => {}),
      setInputMode: mock(() => {}),
      getHistoryShortcut: () => 'ctrl+o',
      addNotification: mock(() => {}),
    })

    expect(appendActiveContextWarning).toHaveBeenCalledTimes(1)
  })

  test('preserves fullscreen from-direction compact behavior and resubmit side effects', async () => {
    const first = systemMessage('s1')
    const message = userMessage('u1')
    const tail = systemMessage('s2')
    const boundary = systemMessage('boundary')
    const kept = systemMessage('kept')
    const summary = systemMessage('summary')
    const attachment = systemMessage('attachment')
    const hook = systemMessage('hook')
    const setMessages = mock(() => {})
    const clearContextBlockedIfNeeded = mock(() => {})
    const setConversationId = mock(() => {})
    const runPostCompactCleanup = mock(() => {})
    const onTranscriptReset = mock(() => {})
    const setInputValue = mock(() => {})
    const setInputMode = mock(() => {})
    const addNotification = mock(() => {})
    const context = {
      getAppState: () => ({}),
      options: {
        querySource: 'repl',
      },
    } as never

    await dispatchReplMessageSelectorSummarize(message, 'feedback', 'from', {
      messages: [first, message, tail],
      getMessagesAfterCompactBoundary: messages => messages,
      appendActiveContextWarning: mock(() => {}),
      createAbortController: () => new AbortController(),
      buildToolUseContext: mock(() => context),
      buildRenderedSystemPrompt: mock(async () => 'system-prompt'),
      getUserContext: mock(async () => ({ user: 'ctx' })),
      getSystemContext: mock(async () => ({ system: 'ctx' })),
      partialCompactConversation: mock(async () => ({
        boundaryMarker: boundary,
        summaryMessages: [summary],
        attachments: [attachment],
        hookResults: [hook],
        messagesToKeep: [kept],
      })),
      isFullscreenEnvEnabled: () => true,
      setMessages,
      clearContextBlockedIfNeeded,
      setConversationId,
      generateConversationId: () => 'next-session',
      onTranscriptReset,
      runPostCompactCleanup,
      textForResubmit: () => ({ text: '/redo', mode: 'prompt' }),
      setInputValue,
      setInputMode,
      getHistoryShortcut: () => 'ctrl+o',
      addNotification,
    })

    expect(setMessages).toHaveBeenCalledTimes(1)
    const update = setMessages.mock.calls[0]?.[0] as (old: Message[]) => Message[]
    expect(typeof update).toBe('function')
    expect(update([first, message, tail])).toEqual([
      first,
      boundary,
      kept,
      summary,
      attachment,
      hook,
    ])
    expect(clearContextBlockedIfNeeded).toHaveBeenCalledTimes(1)
    expect(setConversationId).toHaveBeenCalledWith('next-session')
    expect(onTranscriptReset).toHaveBeenCalledTimes(1)
    expect(runPostCompactCleanup).toHaveBeenCalledWith('repl')
    expect(setInputValue).toHaveBeenCalledWith('/redo')
    expect(setInputMode).toHaveBeenCalledWith('prompt')
    expect(addNotification).toHaveBeenCalledWith({
      key: 'summarize-ctrl-o-hint',
      text: 'Conversation summarized (ctrl+o for history)',
      priority: 'medium',
      timeoutMs: 8000,
    })
  })

  test('uses direct replacement outside fullscreen from-direction and skips resubmit for up_to', async () => {
    const message = userMessage('u1')
    const boundary = systemMessage('boundary')
    const summary = systemMessage('summary')
    const kept = systemMessage('kept')
    const setMessages = mock(() => {})
    const setInputValue = mock(() => {})
    const setInputMode = mock(() => {})
    const onTranscriptReset = mock(() => {})

    await dispatchReplMessageSelectorSummarize(message, undefined, 'up_to', {
      messages: [message],
      getMessagesAfterCompactBoundary: messages => messages,
      appendActiveContextWarning: mock(() => {}),
      createAbortController: () => new AbortController(),
      buildToolUseContext: mock(() => ({
        getAppState: () => ({}),
        options: { querySource: 'repl' },
      }) as never),
      buildRenderedSystemPrompt: mock(async () => 'system-prompt'),
      getUserContext: mock(async () => ({})),
      getSystemContext: mock(async () => ({})),
      partialCompactConversation: mock(async () => ({
        boundaryMarker: boundary,
        summaryMessages: [summary],
        attachments: [],
        hookResults: [],
        messagesToKeep: [kept],
      })),
      isFullscreenEnvEnabled: () => true,
      setMessages,
      clearContextBlockedIfNeeded: mock(() => {}),
      setConversationId: mock(() => {}),
      generateConversationId: () => 'next-session',
      onTranscriptReset,
      runPostCompactCleanup: mock(() => {}),
      textForResubmit: () => ({ text: 'should-not-run', mode: 'bash' }),
      setInputValue,
      setInputMode,
      getHistoryShortcut: () => 'ctrl+o',
      addNotification: mock(() => {}),
    })

    expect(setMessages).toHaveBeenCalledWith([boundary, summary, kept])
    expect(onTranscriptReset).toHaveBeenCalledTimes(1)
    expect(setInputValue).not.toHaveBeenCalled()
    expect(setInputMode).not.toHaveBeenCalled()
  })
})
