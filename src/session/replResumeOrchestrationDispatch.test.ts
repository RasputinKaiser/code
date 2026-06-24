import { describe, expect, test } from 'bun:test'
import { dispatchReplResumeOrchestration } from './replResumeOrchestrationDispatch.js'

describe('dispatchReplResumeOrchestration', () => {
  test('runs preparation, session switch, and finalize in order then emits success analytics', async () => {
    const calls: string[] = []
    const events: unknown[] = []

    await dispatchReplResumeOrchestration(
      {
        entrypoint: 'resume_screen',
      },
      {
        nowMs: () => {
          calls.push('now')
          return calls.length === 1 ? 1000 : 1348
        },
        runPreparation: async () => {
          calls.push('prepare')
        },
        runSessionSwitch: async () => {
          calls.push('switch')
        },
        runFinalize: () => {
          calls.push('finalize')
        },
        logResumeEvent: event => {
          events.push(event)
        },
      },
    )

    expect(calls).toEqual(['now', 'prepare', 'switch', 'finalize', 'now'])
    expect(events).toEqual([
      {
        entrypoint: 'resume_screen',
        success: true,
        resume_duration_ms: 348,
      },
    ])
  })

  test('emits failure analytics and rethrows when orchestration fails', async () => {
    const calls: string[] = []
    const events: unknown[] = []
    const expectedError = new Error('session switch failed')

    await expect(
      dispatchReplResumeOrchestration(
        {
          entrypoint: 'cli_flag',
        },
        {
          nowMs: () => {
            calls.push('now')
            return 2000
          },
          runPreparation: async () => {
            calls.push('prepare')
          },
          runSessionSwitch: async () => {
            calls.push('switch')
            throw expectedError
          },
          runFinalize: () => {
            calls.push('finalize')
          },
          logResumeEvent: event => {
            events.push(event)
          },
        },
      ),
    ).rejects.toBe(expectedError)

    expect(calls).toEqual(['now', 'prepare', 'switch'])
    expect(events).toEqual([
      {
        entrypoint: 'cli_flag',
        success: false,
      },
    ])
  })
})
