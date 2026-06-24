import { describe, expect, mock, test } from 'bun:test'
import type { Message as MessageType, UserMessage } from '../types/message.js'
import { dispatchReplQueryPrelude } from './replQueryPreludeDispatch.js'

function createUserMessage(text: string, isMeta = false): UserMessage {
  return {
    uuid: `user-${text}`,
    type: 'user',
    isMeta,
    message: {
      role: 'user',
      content: text,
    },
  } as UserMessage
}

function flushMicrotasks(): Promise<void> {
  return new Promise(resolve => queueMicrotask(resolve))
}

describe('dispatchReplQueryPrelude', () => {
  test('prepares IDE query state only when a real query is about to run', () => {
    const handleQueryStart = mock(() => {})
    const closeOpenDiffs = mock(() => {})
    const maybeMarkProjectOnboardingComplete = mock(() => {})

    dispatchReplQueryPrelude(
      {
        shouldQuery: true,
        newMessages: [],
      },
      {
        initialMcpClients: [{ id: 'initial' } as never],
        getDynamicMcpClients: () => [{ id: 'dynamic' } as never],
        handleQueryStart,
        getConnectedIdeClient: clients => ({ clients }),
        closeOpenDiffs,
        maybeMarkProjectOnboardingComplete,
        titleDisabled: true,
        sessionTitle: undefined,
        agentTitle: undefined,
        haikuTitleAttemptedRef: { current: false },
        getContentText: () => null,
        syntheticBreadcrumbPrefixes: [],
        generateSessionTitle: mock(async () => null),
        setHaikuTitle: mock(() => {}),
        mergeClients: (initial, dynamic) => [...initial, ...dynamic],
      },
    )

    expect(handleQueryStart).toHaveBeenCalledWith([
      { id: 'initial' },
      { id: 'dynamic' },
    ])
    expect(closeOpenDiffs).toHaveBeenCalledTimes(1)
    expect(maybeMarkProjectOnboardingComplete).toHaveBeenCalledTimes(1)

    handleQueryStart.mockClear()
    closeOpenDiffs.mockClear()
    maybeMarkProjectOnboardingComplete.mockClear()

    dispatchReplQueryPrelude(
      {
        shouldQuery: false,
        newMessages: [],
      },
      {
        initialMcpClients: [{ id: 'initial' } as never],
        getDynamicMcpClients: () => [{ id: 'dynamic' } as never],
        handleQueryStart,
        getConnectedIdeClient: () => ({ id: 'ide' }),
        closeOpenDiffs,
        maybeMarkProjectOnboardingComplete,
        titleDisabled: true,
        sessionTitle: undefined,
        agentTitle: undefined,
        haikuTitleAttemptedRef: { current: false },
        getContentText: () => null,
        syntheticBreadcrumbPrefixes: [],
        generateSessionTitle: mock(async () => null),
        setHaikuTitle: mock(() => {}),
        mergeClients: (initial, dynamic) => [...initial, ...dynamic],
      },
    )

    expect(handleQueryStart).not.toHaveBeenCalled()
    expect(closeOpenDiffs).not.toHaveBeenCalled()
    expect(maybeMarkProjectOnboardingComplete).toHaveBeenCalledTimes(1)
  })

  test('skips title generation when the first non-meta user message is a synthetic breadcrumb', async () => {
    const haikuTitleAttemptedRef = { current: false }
    const setHaikuTitle = mock(() => {})
    const generateSessionTitle = mock(async () => 'Useful title')

    dispatchReplQueryPrelude(
      {
        shouldQuery: false,
        newMessages: [
          createUserMessage('<command-message> synthetic'),
          createUserMessage('real user prompt'),
          createUserMessage('meta prompt', true),
        ] as MessageType[],
      },
      {
        initialMcpClients: [],
        getDynamicMcpClients: () => [],
        handleQueryStart: mock(() => {}),
        getConnectedIdeClient: () => undefined,
        closeOpenDiffs: mock(() => {}),
        maybeMarkProjectOnboardingComplete: mock(() => {}),
        titleDisabled: false,
        sessionTitle: undefined,
        agentTitle: undefined,
        haikuTitleAttemptedRef,
        getContentText: content => String(content),
        syntheticBreadcrumbPrefixes: ['command-message'],
        generateSessionTitle,
        setHaikuTitle,
        mergeClients: (initial, dynamic) => [...initial, ...dynamic],
      },
    )

    expect(haikuTitleAttemptedRef.current).toBe(false)
    expect(generateSessionTitle).not.toHaveBeenCalled()

    await flushMicrotasks()

    expect(setHaikuTitle).not.toHaveBeenCalled()
  })

  test('generates a title when the first non-meta user message is real prose', async () => {
    const haikuTitleAttemptedRef = { current: false }
    const setHaikuTitle = mock(() => {})
    const generateSessionTitle = mock(async () => 'Useful title')

    dispatchReplQueryPrelude(
      {
        shouldQuery: false,
        newMessages: [createUserMessage('real user prompt')] as MessageType[],
      },
      {
        initialMcpClients: [],
        getDynamicMcpClients: () => [],
        handleQueryStart: mock(() => {}),
        getConnectedIdeClient: () => undefined,
        closeOpenDiffs: mock(() => {}),
        maybeMarkProjectOnboardingComplete: mock(() => {}),
        titleDisabled: false,
        sessionTitle: undefined,
        agentTitle: undefined,
        haikuTitleAttemptedRef,
        getContentText: content => String(content),
        syntheticBreadcrumbPrefixes: ['command-message'],
        generateSessionTitle,
        setHaikuTitle,
        mergeClients: (initial, dynamic) => [...initial, ...dynamic],
      },
    )

    expect(haikuTitleAttemptedRef.current).toBe(true)
    expect(generateSessionTitle).toHaveBeenCalledWith(
      'real user prompt',
      expect.any(AbortSignal),
    )

    await flushMicrotasks()

    expect(setHaikuTitle).toHaveBeenCalledWith('Useful title')
    expect(haikuTitleAttemptedRef.current).toBe(true)
  })

  test('restores the title-attempt gate when generation yields no title or fails', async () => {
    const noTitleRef = { current: false }
    dispatchReplQueryPrelude(
      {
        shouldQuery: false,
        newMessages: [createUserMessage('real user prompt')] as MessageType[],
      },
      {
        initialMcpClients: [],
        getDynamicMcpClients: () => [],
        handleQueryStart: mock(() => {}),
        getConnectedIdeClient: () => undefined,
        closeOpenDiffs: mock(() => {}),
        maybeMarkProjectOnboardingComplete: mock(() => {}),
        titleDisabled: false,
        sessionTitle: undefined,
        agentTitle: undefined,
        haikuTitleAttemptedRef: noTitleRef,
        getContentText: content => String(content),
        syntheticBreadcrumbPrefixes: [],
        generateSessionTitle: mock(async () => null),
        setHaikuTitle: mock(() => {}),
        mergeClients: (initial, dynamic) => [...initial, ...dynamic],
      },
    )
    await flushMicrotasks()
    expect(noTitleRef.current).toBe(false)

    const failedRef = { current: false }
    dispatchReplQueryPrelude(
      {
        shouldQuery: false,
        newMessages: [createUserMessage('real user prompt')] as MessageType[],
      },
      {
        initialMcpClients: [],
        getDynamicMcpClients: () => [],
        handleQueryStart: mock(() => {}),
        getConnectedIdeClient: () => undefined,
        closeOpenDiffs: mock(() => {}),
        maybeMarkProjectOnboardingComplete: mock(() => {}),
        titleDisabled: false,
        sessionTitle: undefined,
        agentTitle: undefined,
        haikuTitleAttemptedRef: failedRef,
        getContentText: content => String(content),
        syntheticBreadcrumbPrefixes: [],
        generateSessionTitle: mock(async () => {
          throw new Error('title failed')
        }),
        setHaikuTitle: mock(() => {}),
        mergeClients: (initial, dynamic) => [...initial, ...dynamic],
      },
    )
    await flushMicrotasks()
    expect(failedRef.current).toBe(false)
  })
})
