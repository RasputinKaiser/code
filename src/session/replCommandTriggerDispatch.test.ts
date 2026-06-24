import { describe, expect, it, mock } from 'bun:test'
import { getAutoRunCommand } from '../utils/autoRunIssue.js'
import {
  dispatchReplAutoRunIssue,
  dispatchReplCommandTrigger,
  dispatchReplSurveyFeedback,
} from './replCommandTriggerDispatch.js'

describe('dispatchReplAutoRunIssue', () => {
  it('preserves command selection, clears state first, and forwards empty prompt helpers', async () => {
    const calls: string[] = []
    const submit = mock(async (command: string) => {
      calls.push(`submit:${command}`)
    })

    dispatchReplAutoRunIssue(
      {
        autoRunIssueReason: 'feedback_survey_good',
      },
      {
        clearAutoRunIssueReason: () => {
          calls.push('clear')
        },
        submit,
        logDebug: () => {
          calls.push('log')
        },
      },
    )

    await Promise.resolve()

    expect(calls).toEqual(['clear', `submit:${getAutoRunCommand('feedback_survey_good')}`])
    const helpers = submit.mock.calls[0]?.[1]
    expect(typeof helpers?.setCursorOffset).toBe('function')
    expect(typeof helpers?.clearBuffer).toBe('function')
    expect(typeof helpers?.resetHistory).toBe('function')
  })

  it('preserves the existing failure log text', async () => {
    const logDebug = mock(() => {})

    dispatchReplAutoRunIssue(
      {
        autoRunIssueReason: null,
      },
      {
        clearAutoRunIssueReason: () => {},
        submit: async () => {
          throw new Error('boom')
        },
        logDebug,
      },
    )

    await Promise.resolve()

    expect(logDebug).toHaveBeenCalledWith('Auto-run /issue failed: boom')
  })
})

describe('dispatchReplSurveyFeedback', () => {
  it('preserves ant-vs-external command routing', async () => {
    const commands: string[] = []

    dispatchReplSurveyFeedback(
      {
        userType: 'ant',
      },
      {
        submit: async command => {
          commands.push(command)
        },
        logDebug: () => {},
      },
    )
    dispatchReplSurveyFeedback(
      {
        userType: 'external',
      },
      {
        submit: async command => {
          commands.push(command)
        },
        logDebug: () => {},
      },
    )

    await Promise.resolve()

    expect(commands).toEqual(['/issue', '/feedback'])
  })

  it('preserves the existing failure log format', async () => {
    const logDebug = mock(() => {})

    dispatchReplSurveyFeedback(
      {
        userType: 'external',
      },
      {
        submit: async () => {
          throw 'boom'
        },
        logDebug,
      },
    )

    await Promise.resolve()

    expect(logDebug).toHaveBeenCalledWith('Survey feedback request failed: boom')
  })
})

describe('dispatchReplCommandTrigger', () => {
  it('forwards fire-and-forget commands with the blank prompt helpers', async () => {
    const submit = mock(async () => {})

    dispatchReplCommandTrigger('/rate-limit-options', {
      submit,
    })

    await Promise.resolve()

    expect(submit).toHaveBeenCalledWith(
      '/rate-limit-options',
      expect.objectContaining({
        setCursorOffset: expect.any(Function),
        clearBuffer: expect.any(Function),
        resetHistory: expect.any(Function),
      }),
    )
  })
})
