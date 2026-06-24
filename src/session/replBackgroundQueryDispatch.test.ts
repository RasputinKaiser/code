import { describe, expect, test } from 'bun:test'

import type { QueuedCommand } from '../types/textInputTypes.js'
import type { Message } from '../types/message.js'
import { dispatchReplBackgroundQuery } from './replBackgroundQueryDispatch.js'

function createTaskNotification(prompt: string): Message {
  return {
    type: 'attachment',
    uuid: `${prompt}-uuid`,
    timestamp: new Date().toISOString(),
    attachment: {
      type: 'queued_command',
      commandMode: 'task-notification',
      prompt,
    },
  } as unknown as Message
}

describe('dispatchReplBackgroundQuery', () => {
  test('preserves abort/remove ordering and deduplicates notifications by prompt text', async () => {
    const events: string[] = []
    const toolUseContext = {
      options: {
        tools: [],
        mcpClients: [],
      },
    } as any
    const currentMessages = [createTaskNotification('dup')]
    let startedMessages: Message[] | null = null

    await dispatchReplBackgroundQuery({
      abortForegroundQuery: () => {
        events.push('abort')
      },
      removeTaskNotifications: () => {
        events.push('remove')
        return [
          {
            mode: 'task-notification',
            priority: 'now',
            source: 'system',
            prompt: 'queued',
          } as QueuedCommand,
        ]
      },
      buildToolUseContext: () => {
        events.push('context')
        return toolUseContext
      },
      buildRenderedSystemPrompt: async () => {
        events.push('rendered-prompt')
        return 'default prompt + effective'
      },
      getUserContext: async () => {
        events.push('user-context')
        return { user: 'ctx' }
      },
      getSystemContext: async () => {
        events.push('system-context')
        return { system: 'ctx' }
      },
      getNotificationMessages: async removedNotifications => {
        events.push(`attachments:${removedNotifications.length}`)
        return [createTaskNotification('dup'), createTaskNotification('fresh')]
      },
      getCurrentMessages: () => currentMessages,
      startBackgroundSession: params => {
        events.push('start')
        startedMessages = params.messages
        expect(params.queryParams.systemPrompt).toBe('default prompt + effective')
        expect(params.queryParams.toolUseContext).toBe(toolUseContext)
      },
      canUseTool: undefined,
      querySource: 'repl' as any,
      description: 'terminal title',
      setAppState: updater => updater as any,
      agentDefinition: undefined,
    })

    expect(events).toEqual([
      'abort',
      'remove',
      'context',
      'rendered-prompt',
      'user-context',
      'system-context',
      'attachments:1',
      'start',
    ])
    expect(toolUseContext.renderedSystemPrompt).toBe('default prompt + effective')
    expect(startedMessages).toEqual([
      currentMessages[0],
      expect.objectContaining({
        type: 'attachment',
        attachment: expect.objectContaining({
          prompt: 'fresh',
        }),
      }),
    ])
  })

  test('falls back to no forwarded notifications when attachment conversion fails', async () => {
    const currentMessages = [createTaskNotification('existing')]
    let startedMessages: Message[] | null = null

    await dispatchReplBackgroundQuery({
      abortForegroundQuery: () => {},
      removeTaskNotifications: () =>
        [
          {
            mode: 'task-notification',
            priority: 'next',
            source: 'system',
            prompt: 'queued',
          } as QueuedCommand,
        ],
      buildToolUseContext: () =>
        ({
          options: {
            tools: [],
            mcpClients: [],
          },
        }) as any,
      buildRenderedSystemPrompt: async () => 'default',
      getUserContext: async () => ({}),
      getSystemContext: async () => ({}),
      getNotificationMessages: async () => {
        throw new Error('boom')
      },
      getCurrentMessages: () => currentMessages,
      startBackgroundSession: params => {
        startedMessages = params.messages
      },
      canUseTool: undefined,
      querySource: 'repl' as any,
      description: 'terminal title',
      setAppState: updater => updater as any,
      agentDefinition: undefined,
    })

    expect(startedMessages).toEqual(currentMessages)
  })
})
