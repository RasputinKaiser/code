import { describe, expect, test } from 'bun:test'

import { dispatchReplIncomingPrompt } from './replIncomingPromptDispatch.js'

describe('dispatchReplIncomingPrompt', () => {
  test('preserves the query-active guard', () => {
    const events: string[] = []

    const handled = dispatchReplIncomingPrompt(
      {
        content: 'queued teammate prompt',
      },
      {
        queryGuardActive: true,
        queuedCommands: [],
        createAbortController: () => {
          events.push('create-abort')
          return new AbortController()
        },
        setAbortController: () => {
          events.push('set-abort')
        },
        submitQuery: () => {
          events.push('submit')
        },
      },
    )

    expect(handled).toBe(false)
    expect(events).toEqual([])
  })

  test('defers to queued user prompt and bash commands before system prompts', () => {
    const events: string[] = []

    const handled = dispatchReplIncomingPrompt(
      {
        content: 'system prompt',
      },
      {
        queryGuardActive: false,
        queuedCommands: [
          {
            prompt: 'queued prompt',
            mode: 'prompt',
            source: 'user',
            priority: 'now',
          },
          {
            prompt: 'queued bash',
            mode: 'bash',
            source: 'user',
            priority: 'next',
          },
        ],
        createAbortController: () => {
          events.push('create-abort')
          return new AbortController()
        },
        setAbortController: () => {
          events.push('set-abort')
        },
        submitQuery: () => {
          events.push('submit')
        },
      },
    )

    expect(handled).toBe(false)
    expect(events).toEqual([])
  })

  test('preserves abort setup before direct-query submit and forwards meta prompts', () => {
    const events: string[] = []
    let submittedMessage: { content: unknown; isMeta?: boolean } | null = null
    let submittedAbortController: AbortController | null = null

    const handled = dispatchReplIncomingPrompt(
      {
        content: 'teammate follow-up',
        isMeta: true,
      },
      {
        queryGuardActive: false,
        queuedCommands: [],
        createAbortController: () => {
          events.push('create-abort')
          return new AbortController()
        },
        setAbortController: abortController => {
          events.push('set-abort')
          submittedAbortController = abortController
        },
        submitQuery: (message, abortController) => {
          events.push('submit')
          submittedMessage = {
            content: message.message.content,
            isMeta: message.isMeta,
          }
          expect(abortController).toBe(submittedAbortController)
        },
      },
    )

    expect(handled).toBe(true)
    expect(events).toEqual(['create-abort', 'set-abort', 'submit'])
    expect(submittedMessage).toEqual({
      content: 'teammate follow-up',
      isMeta: true,
    })
  })
})
