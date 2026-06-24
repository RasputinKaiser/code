import { describe, expect, it } from 'bun:test'
import {
  dispatchBackgroundPrShortcut,
  getBackgroundPrDescription,
} from './backgroundPrShortcutDispatch.js'

describe('getBackgroundPrDescription', () => {
  it('uses the first non-empty trimmed line', () => {
    expect(
      getBackgroundPrDescription('\n   \n  Ship the feature branch  \nsecond line'),
    ).toBe('Ship the feature branch')
  })

  it('truncates long first lines to the existing 96-character limit', () => {
    expect(getBackgroundPrDescription('a'.repeat(100))).toBe(`${'a'.repeat(95)}…`)
  })
})

describe('dispatchBackgroundPrShortcut', () => {
  it('launches the task, appends the user/system messages, and notifies success', async () => {
    const notifications: unknown[] = []
    const messageBatches: unknown[][] = []
    const events: string[] = []

    await dispatchBackgroundPrShortcut(
      {
        input: '& ship the feature',
        prompt: 'ship the feature',
        mainLoopModel: 'gpt-test',
      },
      {
        addNotification: options => {
          notifications.push(options)
        },
        createAbortController: () => {
          events.push('createAbortController')
          return new AbortController()
        },
        getMessages: () => {
          events.push('getMessages')
          return []
        },
        getToolUseContext: (messages, newMessages, abortController, mainLoopModel) => {
          events.push(
            `getToolUseContext:${messages.length}:${newMessages.length}:${String(
              abortController instanceof AbortController,
            )}:${mainLoopModel}`,
          )
          return { toolUseId: 'tool-use' } as never
        },
        setMessages: updater => {
          messageBatches.push(updater([]))
        },
        launchSuggestBackgroundPRTaskImpl: async options => {
          events.push(
            `launch:${options.description}:${options.prompt}:${String(
              options.use_bundle,
            )}:${String((options.toolUseContext as { toolUseId?: string }).toolUseId)}`,
          )
          return {
            taskId: 'task-1',
            sessionUrl: 'https://example.invalid/session',
            outputFile: '/tmp/output.txt',
          }
        },
      },
    )

    expect(events).toEqual([
      'getMessages',
      'createAbortController',
      'getToolUseContext:0:0:true:gpt-test',
      'launch:ship the feature:ship the feature:true:tool-use',
    ])
    expect(messageBatches).toHaveLength(1)
    expect(messageBatches[0]).toHaveLength(2)
    expect(messageBatches[0][0]).toMatchObject({
      type: 'user',
      message: {
        role: 'user',
        content: '& ship the feature',
      },
    })
    expect(messageBatches[0][1]).toMatchObject({
      type: 'system',
      subtype: 'informational',
      level: 'info',
      content:
        'Background PR task launched in CCR.\n' +
        'taskId: task-1\n' +
        'session_url: https://example.invalid/session\n' +
        'output_file: /tmp/output.txt',
    })
    expect(notifications).toEqual([
      {
        key: 'suggest-background-pr-launched-task-1',
        text: 'Background PR launched: task-1',
        priority: 'immediate',
        timeoutMs: 3500,
      },
    ])
  })

  it('appends the warning system message and failure notification on launch errors', async () => {
    const notifications: unknown[] = []
    const messageBatches: unknown[][] = []

    await dispatchBackgroundPrShortcut(
      {
        input: '& ship the feature',
        prompt: 'ship the feature',
        mainLoopModel: 'gpt-test',
      },
      {
        addNotification: options => {
          notifications.push(options)
        },
        createAbortController: () => new AbortController(),
        getMessages: () => [],
        getToolUseContext: () => ({}) as never,
        setMessages: updater => {
          messageBatches.push(updater([]))
        },
        launchSuggestBackgroundPRTaskImpl: async () => {
          throw new Error('bundle blew up')
        },
      },
    )

    expect(messageBatches).toHaveLength(1)
    expect(messageBatches[0]).toEqual([
      expect.objectContaining({
        type: 'system',
        subtype: 'informational',
        level: 'warning',
        content: 'Background PR launch failed: bundle blew up',
      }),
    ])
    expect(notifications).toEqual([
      {
        key: 'suggest-background-pr-launch-failed',
        text: 'Background PR launch failed: bundle blew up',
        priority: 'immediate',
        timeoutMs: 5000,
      },
    ])
  })
})
