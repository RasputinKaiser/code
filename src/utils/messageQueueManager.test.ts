import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'
import { join } from 'path'

import type { QueuedCommand } from '../types/textInputTypes.js'
import {
  clearCommandQueue,
  dequeue,
  enqueue,
  enqueuePendingNotification,
  getCommandQueue,
  getCommandsByMaxPriority,
  isQueuedCommandEditable,
  isQueuedCommandVisible,
  isSlashCommand,
  peek,
  popAllEditable,
  resetCommandQueue,
} from './messageQueueManager.js'
import {
  resetProjectForTesting,
  setSessionFileForTesting,
} from './sessionStorage.js'

function createQueuedCommand(
  overrides: Partial<QueuedCommand> & Pick<QueuedCommand, 'value' | 'mode'>,
): QueuedCommand {
  return {
    ...overrides,
  }
}

beforeEach(() => {
  resetCommandQueue()
  resetProjectForTesting()
  setSessionFileForTesting(
    join(
      tmpdir(),
      'ncode-message-queue-tests',
      randomUUID(),
      'session.jsonl',
    ),
  )
})

afterEach(() => {
  clearCommandQueue()
  resetCommandQueue()
  resetProjectForTesting()
})

describe('messageQueueManager', () => {
  it('dequeues by priority while letting filters skip unmatched commands', () => {
    const subagentNow = createQueuedCommand({
      value: 'subagent interrupt',
      mode: 'prompt',
      priority: 'now',
      agentId: 'agent-1' as never,
    })
    const mainPrompt = createQueuedCommand({
      value: 'main prompt',
      mode: 'prompt',
    })
    const deferredNotification = createQueuedCommand({
      value: 'background tick',
      mode: 'task-notification',
    })

    enqueue(subagentNow)
    enqueue(mainPrompt)
    enqueuePendingNotification(deferredNotification)

    expect(peek(cmd => cmd.agentId === undefined)).toMatchObject({
      value: 'main prompt',
      priority: 'next',
    })
    expect(dequeue(cmd => cmd.agentId === undefined)).toMatchObject({
      value: 'main prompt',
      priority: 'next',
    })
    expect(getCommandQueue()).toEqual([
      expect.objectContaining({
        value: 'subagent interrupt',
        priority: 'now',
      }),
      expect.objectContaining({
        value: 'background tick',
        priority: 'later',
      }),
    ])

    expect(dequeue()).toMatchObject({
      value: 'subagent interrupt',
      priority: 'now',
    })
    expect(dequeue()).toMatchObject({
      value: 'background tick',
      priority: 'later',
    })
    expect(dequeue()).toBeUndefined()
  })

  it('returns commands up to a max priority threshold without mutating the queue', () => {
    enqueue(
      createQueuedCommand({
        value: 'interrupt',
        mode: 'prompt',
        priority: 'now',
      }),
    )
    enqueue(
      createQueuedCommand({
        value: 'follow-up',
        mode: 'prompt',
      }),
    )
    enqueuePendingNotification(
      createQueuedCommand({
        value: 'later notice',
        mode: 'task-notification',
      }),
    )

    expect(
      getCommandsByMaxPriority('next').map(cmd => ({
        value: cmd.value,
        priority: cmd.priority,
      })),
    ).toEqual([
      {
        value: 'interrupt',
        priority: 'now',
      },
      {
        value: 'follow-up',
        priority: 'next',
      },
    ])
    expect(getCommandQueue()).toHaveLength(3)
  })

  it('pops only editable commands, preserving text order and restoring queued images', () => {
    enqueue(
      createQueuedCommand({
        value: 'first queued line',
        mode: 'prompt',
        pastedContents: {
          7: {
            id: 7,
            type: 'image',
            content: 'queued-image',
            mediaType: 'image/png',
            filename: 'queued.png',
          },
        },
      }),
    )
    enqueue(
      createQueuedCommand({
        value: [
          {
            type: 'text',
            text: 'bridge text',
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              data: 'embedded-image',
              media_type: 'image/jpeg',
            },
          },
        ],
        mode: 'bash',
      }),
    )
    const taskNotification = createQueuedCommand({
      value: 'scheduled task',
      mode: 'task-notification',
    })
    enqueuePendingNotification(taskNotification)

    const result = popAllEditable('draft', 2)

    expect(result).toMatchObject({
      text: 'first queued line\nbridge text\ndraft',
      cursorOffset: 'first queued line\nbridge text'.length + 1 + 2,
    })
    expect(result?.images).toHaveLength(2)
    expect(result?.images[0]).toEqual({
      id: 7,
      type: 'image',
      content: 'queued-image',
      mediaType: 'image/png',
      filename: 'queued.png',
    })
    expect(result?.images[1]).toMatchObject({
      type: 'image',
      content: 'embedded-image',
      mediaType: 'image/jpeg',
      filename: 'image1',
    })
    expect(result?.images[1]?.id).toEqual(expect.any(Number))
    expect(result?.images[1]?.id).not.toBe(7)
    expect(getCommandQueue()).toEqual([
      expect.objectContaining({
        value: 'scheduled task',
        mode: 'task-notification',
        priority: 'later',
      }),
    ])
  })

  it('distinguishes editable and visible queue items from hidden or deferred ones', () => {
    const prompt = createQueuedCommand({
      value: 'user prompt',
      mode: 'prompt',
    })
    const metaPrompt = createQueuedCommand({
      value: 'hidden meta prompt',
      mode: 'prompt',
      isMeta: true,
    })
    const notification = createQueuedCommand({
      value: 'background task',
      mode: 'task-notification',
    })

    expect(isQueuedCommandEditable(prompt)).toBe(true)
    expect(isQueuedCommandVisible(prompt)).toBe(true)

    expect(isQueuedCommandEditable(metaPrompt)).toBe(false)
    expect(isQueuedCommandVisible(metaPrompt)).toBe(false)

    expect(isQueuedCommandEditable(notification)).toBe(false)
    expect(isQueuedCommandVisible(notification)).toBe(false)
  })

  it('treats skipped slash-command text as plain prompt content', () => {
    expect(
      isSlashCommand(
        createQueuedCommand({
          value: '/commit',
          mode: 'prompt',
        }),
      ),
    ).toBe(true)
    expect(
      isSlashCommand(
        createQueuedCommand({
          value: '/commit',
          mode: 'prompt',
          skipSlashCommands: true,
        }),
      ),
    ).toBe(false)
    expect(
      isSlashCommand(
        createQueuedCommand({
          value: [
            {
              type: 'text',
              text: '/commit',
            },
          ],
          mode: 'prompt',
        }),
      ),
    ).toBe(false)
  })
})
