import { describe, expect, it } from 'bun:test'
import { dispatchPromptInputSubmitIntent } from './promptInputSubmitIntentDispatch.js'

describe('dispatchPromptInputSubmitIntent', () => {
  it('preserves the speculation-accept submit contract and ordering', async () => {
    const events: string[] = []

    const result = await dispatchPromptInputSubmitIntent(
      {
        inputToSubmit: 'accepted speculation',
        intent: { kind: 'accept-speculation' },
        helpers: {
          setCursorOffset: () => {
            events.push('setCursorOffset')
          },
          clearBuffer: () => {
            events.push('clearBuffer')
          },
          resetHistory: () => {
            events.push('resetHistory')
          },
        },
        speculation: {
          status: 'active',
        } as never,
        speculationSessionTimeSavedMs: 42,
        setAppState: () => {},
      },
      {
        markAccepted: () => {
          events.push('markAccepted')
        },
        logOutcomeAtSubmission: (input, options) => {
          events.push(`log:${input}:${String(options?.skipReset)}`)
        },
        onSubmitProp: async (input, _helpers, speculationAccept) => {
          events.push(
            `submit:${input}:${speculationAccept?.speculationSessionTimeSavedMs}:${speculationAccept?.state.status}`,
          )
        },
      },
    )

    expect(result).toEqual({ handled: true })
    expect(events).toEqual([
      'markAccepted',
      'log:accepted speculation:true',
      'submit:accepted speculation:42:active',
    ])
  })

  it('accepts prompt suggestions without handling the submit itself', async () => {
    const events: string[] = []

    const result = await dispatchPromptInputSubmitIntent(
      {
        inputToSubmit: 'accepted suggestion',
        intent: { kind: 'accept-suggestion' },
        helpers: {
          setCursorOffset: () => {},
          clearBuffer: () => {},
          resetHistory: () => {},
        },
        speculation: {} as never,
        speculationSessionTimeSavedMs: 0,
        setAppState: () => {},
      },
      {
        markAccepted: () => {
          events.push('markAccepted')
        },
        logOutcomeAtSubmission: () => {
          events.push('log')
        },
        onSubmitProp: async () => {
          events.push('submit')
        },
      },
    )

    expect(result).toEqual({
      handled: false,
      nextInput: 'accepted suggestion',
    })
    expect(events).toEqual(['markAccepted'])
  })

  it('passes through ordinary submits unchanged', async () => {
    expect(
      await dispatchPromptInputSubmitIntent(
        {
          inputToSubmit: 'plain submit',
          intent: { kind: 'none' },
          helpers: {
            setCursorOffset: () => {},
            clearBuffer: () => {},
            resetHistory: () => {},
          },
          speculation: {} as never,
          speculationSessionTimeSavedMs: 0,
          setAppState: () => {},
        },
        {
          markAccepted: () => {
            throw new Error('should not mark accepted')
          },
          logOutcomeAtSubmission: () => {
            throw new Error('should not log')
          },
          onSubmitProp: async () => {
            throw new Error('should not submit')
          },
        },
      ),
    ).toEqual({
      handled: false,
      nextInput: 'plain submit',
    })
  })
})
