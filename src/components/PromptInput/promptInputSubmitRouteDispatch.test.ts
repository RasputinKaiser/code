import { describe, expect, it } from 'bun:test'
import {
  dispatchPromptInputAgentRoute,
  dispatchPromptInputDirectMessageShortcut,
} from './promptInputSubmitRouteDispatch.js'

describe('dispatchPromptInputDirectMessageShortcut', () => {
  it('returns false without side effects when the shortcut is disabled or does not parse', async () => {
    const notifications: unknown[] = []
    const events: string[] = []

    expect(
      await dispatchPromptInputDirectMessageShortcut(
        {
          input: '@alice hello',
          swarmsEnabled: false,
          teamContext: null,
        },
        {
          addNotification: notification => {
            notifications.push(notification)
          },
          clearDraft: () => {
            events.push('clearDraft')
          },
        },
      ),
    ).toBe(false)

    expect(
      await dispatchPromptInputDirectMessageShortcut(
        {
          input: 'normal prompt',
          swarmsEnabled: true,
          teamContext: null,
        },
        {
          addNotification: notification => {
            notifications.push(notification)
          },
          clearDraft: () => {
            events.push('clearDraft')
          },
        },
      ),
    ).toBe(false)

    expect(notifications).toEqual([])
    expect(events).toEqual([])
  })

  it('notifies and clears the draft on successful direct delivery', async () => {
    const notifications: unknown[] = []
    const events: string[] = []

    const handled = await dispatchPromptInputDirectMessageShortcut(
      {
        input: '@alice hello there',
        swarmsEnabled: true,
        teamContext: {
          teamName: 'alpha',
          teammates: {},
        } as never,
      },
      {
        addNotification: notification => {
          notifications.push(notification)
        },
        clearDraft: () => {
          events.push('clearDraft')
        },
        sendDirectMemberMessageImpl: async (
          recipientName,
          message,
          teamContext,
          writeToMailbox,
        ) => {
          events.push(
            `send:${recipientName}:${message}:${String(teamContext?.teamName)}:${String(
              writeToMailbox,
            )}`,
          )
          return {
            success: true,
            recipientName,
          }
        },
      },
    )

    expect(handled).toBe(true)
    expect(events).toEqual(['send:alice:hello there:alpha:undefined', 'clearDraft'])
    expect(notifications).toEqual([
      {
        key: 'direct-message-sent',
        text: 'Sent to @alice',
        priority: 'immediate',
        timeoutMs: 3000,
      },
    ])
  })

  it('falls through on no-team-context and unknown-recipient outcomes', async () => {
    const notifications: unknown[] = []
    const events: string[] = []

    expect(
      await dispatchPromptInputDirectMessageShortcut(
        {
          input: '@alice hello there',
          swarmsEnabled: true,
          teamContext: null,
        },
        {
          addNotification: notification => {
            notifications.push(notification)
          },
          clearDraft: () => {
            events.push('clearDraft')
          },
          sendDirectMemberMessageImpl: async () => ({
            success: false,
            error: 'no_team_context',
          }),
        },
      ),
    ).toBe(false)

    expect(
      await dispatchPromptInputDirectMessageShortcut(
        {
          input: '@alice hello there',
          swarmsEnabled: true,
          teamContext: {
            teamName: 'alpha',
            teammates: {},
          } as never,
        },
        {
          addNotification: notification => {
            notifications.push(notification)
          },
          clearDraft: () => {
            events.push('clearDraft')
          },
          sendDirectMemberMessageImpl: async () => ({
            success: false,
            error: 'unknown_recipient',
            recipientName: 'alice',
          }),
        },
      ),
    ).toBe(false)

    expect(notifications).toEqual([])
    expect(events).toEqual([])
  })
})

describe('dispatchPromptInputAgentRoute', () => {
  it('routes viewed-agent input and preserves callback ordering', async () => {
    const events: string[] = []

    const handled = await dispatchPromptInputAgentRoute(
      {
        input: 'route this',
        activeAgent: {
          type: 'viewed',
          task: {
            id: 'task-1',
            type: 'teammate',
          } as never,
        },
      },
      {
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
        onRouted: () => {
          events.push('onRouted')
        },
        onAgentSubmit: async (input, task, helpers) => {
          events.push(`submit:${input}:${task.id}`)
          helpers.clearBuffer()
        },
      },
    )

    expect(handled).toBe(true)
    expect(events).toEqual(['onRouted', 'submit:route this:task-1', 'clearBuffer'])
  })

  it('falls through for leader input or when no agent submitter exists', async () => {
    expect(
      await dispatchPromptInputAgentRoute(
        {
          input: 'leader prompt',
          activeAgent: { type: 'leader' },
        },
        {
          helpers: {
            setCursorOffset: () => {},
            clearBuffer: () => {},
            resetHistory: () => {},
          },
        },
      ),
    ).toBe(false)

    expect(
      await dispatchPromptInputAgentRoute(
        {
          input: 'named prompt',
          activeAgent: {
            type: 'named_agent',
            task: {
              id: 'task-2',
              type: 'local_agent',
            } as never,
          },
        },
        {
          helpers: {
            setCursorOffset: () => {},
            clearBuffer: () => {},
            resetHistory: () => {},
          },
        },
      ),
    ).toBe(false)
  })
})
