import { describe, expect, test } from 'bun:test'

import { dispatchAgentSubmit } from './agentSubmitDispatch.js'

describe('dispatchAgentSubmit', () => {
  test('preserves local running-agent append and queue ordering', async () => {
    const events: string[] = []

    await dispatchAgentSubmit(
      {
        input: 'continue',
        taskId: 'agent-1',
        isLocalAgentTask: true,
        isRunning: true,
      },
      {
        appendMessageToLocalAgent: (taskId, input) => {
          events.push(`append:${taskId}:${input}`)
        },
        queuePendingMessage: (taskId, input) => {
          events.push(`queue:${taskId}:${input}`)
        },
        resumeLocalAgentBackground: async (taskId, input) => {
          events.push(`resume:${taskId}:${input}`)
        },
        injectUserMessageToTeammate: (taskId, input) => {
          events.push(`inject:${taskId}:${input}`)
        },
        logDebug: message => {
          events.push(`debug:${message}`)
        },
        notifyResumeAgentFailed: (taskId, message) => {
          events.push(`notify:${taskId}:${message}`)
        },
        clearInput: () => {
          events.push('input:clear')
        },
        setCursorOffset: value => {
          events.push(`cursor:${value}`)
        },
        clearBuffer: () => {
          events.push('buffer:clear')
        },
      },
    )

    expect(events).toEqual([
      'append:agent-1:continue',
      'queue:agent-1:continue',
      'input:clear',
      'cursor:0',
      'buffer:clear',
    ])
  })

  test('preserves local resume-failure notification path', async () => {
    const events: string[] = []

    await dispatchAgentSubmit(
      {
        input: 'continue',
        taskId: 'agent-2',
        isLocalAgentTask: true,
        isRunning: false,
      },
      {
        appendMessageToLocalAgent: (taskId, input) => {
          events.push(`append:${taskId}:${input}`)
        },
        queuePendingMessage: (taskId, input) => {
          events.push(`queue:${taskId}:${input}`)
        },
        resumeLocalAgentBackground: async () => {
          throw new Error('boom')
        },
        injectUserMessageToTeammate: (taskId, input) => {
          events.push(`inject:${taskId}:${input}`)
        },
        logDebug: message => {
          events.push(`debug:${message}`)
        },
        notifyResumeAgentFailed: (taskId, message) => {
          events.push(`notify:${taskId}:${message}`)
        },
        clearInput: () => {
          events.push('input:clear')
        },
        setCursorOffset: value => {
          events.push(`cursor:${value}`)
        },
        clearBuffer: () => {
          events.push('buffer:clear')
        },
      },
    )

    expect(events).toEqual([
      'append:agent-2:continue',
      'debug:resumeAgentBackground failed: boom',
      'notify:agent-2:boom',
      'input:clear',
      'cursor:0',
      'buffer:clear',
    ])
  })

  test('preserves teammate injection path', async () => {
    const events: string[] = []

    await dispatchAgentSubmit(
      {
        input: 'continue',
        taskId: 'tm-1',
        isLocalAgentTask: false,
        isRunning: false,
      },
      {
        appendMessageToLocalAgent: (taskId, input) => {
          events.push(`append:${taskId}:${input}`)
        },
        queuePendingMessage: (taskId, input) => {
          events.push(`queue:${taskId}:${input}`)
        },
        resumeLocalAgentBackground: async (taskId, input) => {
          events.push(`resume:${taskId}:${input}`)
        },
        injectUserMessageToTeammate: (taskId, input) => {
          events.push(`inject:${taskId}:${input}`)
        },
        logDebug: message => {
          events.push(`debug:${message}`)
        },
        notifyResumeAgentFailed: (taskId, message) => {
          events.push(`notify:${taskId}:${message}`)
        },
        clearInput: () => {
          events.push('input:clear')
        },
        setCursorOffset: value => {
          events.push(`cursor:${value}`)
        },
        clearBuffer: () => {
          events.push('buffer:clear')
        },
      },
    )

    expect(events).toEqual([
      'inject:tm-1:continue',
      'input:clear',
      'cursor:0',
      'buffer:clear',
    ])
  })
})
