import { describe, expect, it } from 'bun:test'
import {
  buildImmediateLocalJsxCompletionMessages,
  executeImmediateLocalJsxCommand,
} from './immediateLocalJsxCommand.js'

describe('buildImmediateLocalJsxCompletionMessages', () => {
  it('keeps transcript breadcrumbs on the main screen and appends meta messages', () => {
    const messages = buildImmediateLocalJsxCompletionMessages({
      commandArgs: 'settings',
      commandName: 'config',
      fullscreenEnabled: false,
      metaMessages: ['meta one'],
      result: 'updated',
      display: 'system',
    })

    expect(messages).toHaveLength(3)
    expect(messages[0]).toMatchObject({
      type: 'system',
      subtype: 'local_command',
    })
    expect(messages[1]).toMatchObject({
      type: 'system',
      subtype: 'local_command',
    })
    expect(messages[2]).toMatchObject({
      type: 'user',
      isMeta: true,
    })
  })

  it('skips the local-command transcript breadcrumbs in fullscreen', () => {
    const messages = buildImmediateLocalJsxCompletionMessages({
      commandArgs: 'settings',
      commandName: 'config',
      fullscreenEnabled: true,
      metaMessages: ['meta one'],
      result: 'updated',
      display: 'system',
    })

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      type: 'user',
      isMeta: true,
    })
  })
})

describe('executeImmediateLocalJsxCommand', () => {
  it('clears local JSX, emits notifications/messages, and restores stash on onDone', async () => {
    const toolStates: unknown[] = []
    const notifications: unknown[] = []
    const messageBatches: unknown[][] = []
    const events: string[] = []

    await executeImmediateLocalJsxCommand(
      {
        command: {
          type: 'local-jsx',
          name: 'config',
          description: 'Config',
          source: 'builtin',
          load: async () => ({
            call: async onDone => {
              onDone('updated', {
                display: 'system',
                metaMessages: ['meta one'],
              })
              return null
            },
          }),
        },
        commandArgs: 'settings',
        commandName: 'config',
        commandNotificationName: 'config',
        fullscreenEnabled: false,
        mainLoopModel: 'gpt-test',
        restoreStashedPrompt: () => {
          events.push('restore')
        },
      },
      {
        addNotification: notification => {
          notifications.push(notification)
        },
        createAbortController: () => new AbortController(),
        getMessages: () => [],
        getToolUseContext: () => ({}) as never,
        setMessages: updater => {
          messageBatches.push(updater([]))
        },
        setToolJSX: value => {
          toolStates.push(value)
        },
      },
    )

    expect(toolStates).toEqual([
      {
        jsx: null,
        shouldHidePromptInput: false,
        clearLocalJSX: true,
      },
    ])
    expect(notifications).toEqual([
      {
        key: 'immediate-config',
        text: 'updated',
        priority: 'immediate',
      },
    ])
    expect(messageBatches).toHaveLength(1)
    expect(messageBatches[0]).toHaveLength(3)
    expect(events).toEqual(['restore'])
  })

  it('shows returned JSX only when onDone has not already fired', async () => {
    const toolStates: unknown[] = []

    await executeImmediateLocalJsxCommand(
      {
        command: {
          type: 'local-jsx',
          name: 'config',
          description: 'Config',
          source: 'builtin',
          load: async () => ({
            call: async () => 'jsx-result',
          }),
        },
        commandArgs: '',
        commandName: 'config',
        commandNotificationName: 'config',
        fullscreenEnabled: false,
        mainLoopModel: 'gpt-test',
      },
      {
        addNotification: () => {},
        createAbortController: () => new AbortController(),
        getMessages: () => [],
        getToolUseContext: () => ({}) as never,
        setMessages: () => {},
        setToolJSX: value => {
          toolStates.push(value)
        },
      },
    )

    expect(toolStates).toEqual([
      {
        jsx: 'jsx-result',
        shouldHidePromptInput: false,
        isLocalJSXCommand: true,
      },
    ])
  })

  it('does not overwrite the cleared local JSX state when onDone fires before JSX resolves', async () => {
    const toolStates: unknown[] = []

    await executeImmediateLocalJsxCommand(
      {
        command: {
          type: 'local-jsx',
          name: 'config',
          description: 'Config',
          source: 'builtin',
          load: async () => ({
            call: async onDone => {
              onDone('updated', {
                display: 'system',
              })
              return 'jsx-result'
            },
          }),
        },
        commandArgs: '',
        commandName: 'config',
        commandNotificationName: 'config',
        fullscreenEnabled: false,
        mainLoopModel: 'gpt-test',
      },
      {
        addNotification: () => {},
        createAbortController: () => new AbortController(),
        getMessages: () => [],
        getToolUseContext: () => ({}) as never,
        setMessages: () => {},
        setToolJSX: value => {
          toolStates.push(value)
        },
      },
    )

    expect(toolStates).toEqual([
      {
        jsx: null,
        shouldHidePromptInput: false,
        clearLocalJSX: true,
      },
    ])
  })
})
