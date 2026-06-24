import { describe, expect, it } from 'bun:test'
import { dispatchPostBookkeepingSubmit } from './postBookkeepingSubmitDispatch.js'

describe('dispatchPostBookkeepingSubmit', () => {
  it('handles speculation accept without starting a follow-up query when none is required', async () => {
    const events: string[] = []

    await dispatchPostBookkeepingSubmit(
      {
        input: 'accept speculation',
        pastedContents: {},
        mainLoopModel: 'gpt-test',
        cwd: '/tmp',
        readFileState: { current: {} as never },
        speculationAccept: {
          state: {} as never,
          speculationSessionTimeSavedMs: 42,
          setAppState: () => {},
        },
        leaderSubmit: {} as never,
      },
      {
        setMessages: () => {},
        createAbortController: () => {
          throw new Error('abort controller should not be created')
        },
        setAbortController: () => {
          throw new Error('abort controller should not be set')
        },
        onQuery: async () => {
          throw new Error('follow-up query should not run')
        },
        handleSpeculationAcceptImpl: async () => {
          events.push('speculation')
          return { queryRequired: false }
        },
        dispatchRemoteSubmitImpl: async () => {
          throw new Error('remote submit should not run')
        },
        dispatchLeaderSubmitImpl: async () => {
          throw new Error('leader submit should not run')
        },
      },
    )

    expect(events).toEqual(['speculation'])
  })

  it('starts the follow-up query fire-and-forget when speculation needs one', async () => {
    const events: string[] = []
    let resolveOnQuery!: () => void
    const onQueryPending = new Promise<void>(resolve => {
      resolveOnQuery = resolve
    })

    const abortController = new AbortController()

    await dispatchPostBookkeepingSubmit(
      {
        input: 'accept speculation',
        pastedContents: {},
        mainLoopModel: 'gpt-test',
        cwd: '/tmp',
        readFileState: { current: {} as never },
        speculationAccept: {
          state: {} as never,
          speculationSessionTimeSavedMs: 42,
          setAppState: () => {},
        },
        leaderSubmit: {} as never,
      },
      {
        setMessages: () => {},
        createAbortController: () => {
          events.push('createAbortController')
          return abortController
        },
        setAbortController: nextAbortController => {
          events.push(`setAbortController:${String(nextAbortController === abortController)}`)
        },
        onQuery: async (
          newMessages,
          nextAbortController,
          shouldQuery,
          additionalAllowedTools,
          mainLoopModel,
        ) => {
          events.push(
            `onQuery:${newMessages.length}:${String(
              nextAbortController === abortController,
            )}:${String(shouldQuery)}:${additionalAllowedTools.length}:${mainLoopModel}`,
          )
          await onQueryPending
        },
        handleSpeculationAcceptImpl: async () => {
          events.push('speculation')
          return { queryRequired: true }
        },
      },
    )

    expect(events).toEqual([
      'speculation',
      'createAbortController',
      'setAbortController:true',
      'onQuery:0:true:true:0:gpt-test',
    ])

    resolveOnQuery()
  })

  it('does not leak a rejected speculation follow-up query', async () => {
    const events: string[] = []
    const abortController = new AbortController()

    await dispatchPostBookkeepingSubmit(
      {
        input: 'accept speculation',
        pastedContents: {},
        mainLoopModel: 'gpt-test',
        cwd: '/tmp',
        readFileState: { current: {} as never },
        speculationAccept: {
          state: {} as never,
          speculationSessionTimeSavedMs: 42,
          setAppState: () => {},
        },
        leaderSubmit: {} as never,
      },
      {
        setMessages: () => {},
        createAbortController: () => abortController,
        setAbortController: nextAbortController => {
          events.push(
            `setAbortController:${String(
              nextAbortController === abortController,
            )}`,
          )
        },
        onQuery: async () => {
          events.push('onQuery')
          throw new Error('follow-up failed')
        },
        handleSpeculationAcceptImpl: async () => {
          events.push('speculation')
          return { queryRequired: true }
        },
      },
    )

    await Bun.sleep(0)

    expect(events).toEqual([
      'speculation',
      'setAbortController:true',
      'onQuery',
    ])
  })

})
