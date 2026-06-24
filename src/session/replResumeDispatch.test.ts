import { describe, expect, test } from 'bun:test'

import type { UUID } from 'crypto'

import { dispatchReplResume } from './replResumeDispatch.js'
import type { Message } from '../types/message.js'

function createMessage(uuid: string): Message {
  return {
    type: 'assistant',
    uuid,
    message: {
      id: `assistant-${uuid}`,
      content: [],
    },
  } as Message
}

describe('dispatchReplResume', () => {
  test('deserializes messages, appends coordinator warning, preserves ordering, and emits analytics', async () => {
    const calls: string[] = []
    const events: unknown[] = []
    let nowCallCount = 0

    await dispatchReplResume(
      {
        sessionId: 'resume-session' as UUID,
        log: {
          messages: ['serialized'],
          mode: 'coordinator',
        } as any,
        entrypoint: 'resume_screen',
      },
      {
        nowMs: () => {
          calls.push('now')
          nowCallCount += 1
          return nowCallCount === 1 ? 100 : 425
        },
        deserializeMessages: input => {
          calls.push(`deserialize:${(input as unknown[]).length}`)
          return [createMessage('deserialized')]
        },
        coordinatorModeEnabled: true,
        getCoordinatorWarning: mode => {
          calls.push(`warning:${mode}`)
          return 'mode mismatch'
        },
        refreshAgentDefinitionsForModeChange: async () => {
          calls.push('refresh-agent-defs')
        },
        createWarningMessage: warning => {
          calls.push(`create-warning:${warning}`)
          return createMessage('warning')
        },
        runPreparation: async messages => {
          calls.push(`prepare:${messages.map(message => message.uuid).join(',')}`)
        },
        runSessionSwitch: async () => {
          calls.push('switch')
        },
        runFinalize: messages => {
          calls.push(`finalize:${messages.map(message => message.uuid).join(',')}`)
        },
        logResumeEvent: event => {
          events.push(event)
        },
      },
    )

    expect(calls).toEqual([
      'deserialize:1',
      'warning:coordinator',
      'refresh-agent-defs',
      'create-warning:mode mismatch',
      'now',
      'prepare:deserialized,warning',
      'switch',
      'finalize:deserialized,warning',
      'now',
    ])
    expect(events).toEqual([
      {
        entrypoint: 'resume_screen',
        success: true,
        resume_duration_ms: 325,
      },
    ])
  })
})
