import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

type MockHookResult = {
  message?: unknown
  blockingError?: { blockingError: string }
  preventContinuation?: boolean
  stopReason?: string
}

const stopHookResults: MockHookResult[] = []
const notifications: unknown[] = []

const hookPaths = [
  import.meta.resolve('../utils/hooks.ts'),
  import.meta.resolve('../utils/hooks.js'),
]
const actualHooks = await import(import.meta.resolve('../utils/hooks.ts'))

for (const hooksPath of hookPaths) {
  mock.module(hooksPath, () => ({
    ...actualHooks,
    executeStopHooks: async function* () {
      for (const result of stopHookResults) {
        yield result
      }
    },
    executeTaskCompletedHooks: async function* () {},
    executeTeammateIdleHooks: async function* () {},
    getStopHookMessage: (blockingError: { blockingError: string }) =>
      `Stop hook feedback:\n${blockingError.blockingError}`,
    getTaskCompletedHookMessage: (blockingError: { blockingError: string }) =>
      `TaskCompleted hook feedback:\n${blockingError.blockingError}`,
    getTeammateIdleHookMessage: (blockingError: { blockingError: string }) =>
      `TeammateIdle hook feedback:\n${blockingError.blockingError}`,
  }))
}

const { handleStopHooks } = await import(import.meta.resolve('./stopHooks.ts'))

for (const hooksPath of hookPaths) {
  mock.module(hooksPath, () => actualHooks)
}

function createToolUseContext() {
  return {
    abortController: new AbortController(),
    agentId: undefined,
    getAppState: () => ({
      toolPermissionContext: { mode: 'default' },
    }),
    addNotification: (notification: unknown) => {
      notifications.push(notification)
    },
  }
}

function expectSummaryMessage(
  events: unknown[],
  expected: Record<string, unknown>,
) {
  const summary = (events as Array<Record<string, unknown>>).find(
    event =>
      event.type === 'system' && event.subtype === 'stop_hook_summary',
  )

  expect(summary).toMatchObject(expected)
}

function expectAttachment(
  events: unknown[],
  attachmentType: string,
  expected: Record<string, unknown>,
) {
  const attachmentMessage = (events as Array<Record<string, unknown>>).find(
    event =>
      event.type === 'attachment' &&
      (event.attachment as { type?: string } | undefined)?.type ===
        attachmentType,
  )

  expect(attachmentMessage).toMatchObject({
    type: 'attachment',
    attachment: expected,
  })
}

function expectUserMessage(events: unknown[], content: string) {
  const userMessage = (events as Array<Record<string, unknown>>).find(
    event =>
      event.type === 'user' &&
      (event.message as { content?: unknown } | undefined)?.content === content,
  )

  expect(userMessage).toMatchObject({
    type: 'user',
    message: {
      role: 'user',
      content,
    },
    isMeta: true,
  })
}

async function collectStream<T>(
  stream: AsyncGenerator<unknown, T>,
): Promise<{ events: unknown[]; terminal: T }> {
  const events: unknown[] = []

  while (true) {
    const next = await stream.next()
    if (next.done) {
      return { events, terminal: next.value }
    }
    events.push(next.value)
  }
}

beforeEach(() => {
  stopHookResults.length = 0
  notifications.length = 0
  process.env.CLAUDE_CODE_SIMPLE = '1'
})

afterEach(() => {
  delete process.env.CLAUDE_CODE_SIMPLE
})

describe('handleStopHooks', () => {
  it('stops continuation and emits a structured summary when a stop hook blocks progress', async () => {
    stopHookResults.push(
      {
        message: {
          type: 'progress',
          toolUseID: 'stop-tool-1',
          data: {
            command: 'npm test',
            promptText: 'check stop hooks',
          },
        },
      },
      {
        message: {
          type: 'attachment',
          attachment: {
            type: 'hook_success',
            hookEvent: 'Stop',
            hookName: 'Stop',
            toolUseID: 'stop-tool-1',
            command: 'npm test',
            stdout: 'hook output',
            stderr: '',
            durationMs: 321,
          },
        },
      },
      {
        preventContinuation: true,
        stopReason: 'Need user confirmation',
      },
    )

    const result = await collectStream(
      handleStopHooks(
        [],
        [],
        {} as never,
        {},
        {},
        createToolUseContext() as never,
        'agent:test' as never,
      ),
    )

    expect(result.terminal).toEqual({
      blockingErrors: [],
      preventContinuation: true,
    })

    expectAttachment(result.events, 'hook_stopped_continuation', {
      type: 'hook_stopped_continuation',
      message: 'Need user confirmation',
      hookName: 'Stop',
      toolUseID: 'stop-tool-1',
      hookEvent: 'Stop',
    })
    expectSummaryMessage(result.events, {
      hookCount: 1,
      preventedContinuation: true,
      stopReason: 'Need user confirmation',
      toolUseID: 'stop-tool-1',
    })

    expect(notifications).toEqual([])
  })

  it('surfaces stop-hook blocking feedback as a meta user message and notification', async () => {
    stopHookResults.push(
      {
        message: {
          type: 'progress',
          toolUseID: 'stop-tool-2',
          data: {
            command: 'eslint .',
            promptText: 'fix lint',
          },
        },
      },
      {
        blockingError: {
          blockingError: 'Please fix lint first',
        },
      },
    )

    const result = await collectStream(
      handleStopHooks(
        [],
        [],
        {} as never,
        {},
        {},
        createToolUseContext() as never,
        'agent:test' as never,
      ),
    )

    expect(result.terminal).toEqual({
      blockingErrors: [
        expect.objectContaining({
          type: 'user',
          message: expect.objectContaining({
            role: 'user',
            content: 'Stop hook feedback:\nPlease fix lint first',
          }),
          isMeta: true,
        }),
      ],
      preventContinuation: false,
    })

    expectUserMessage(result.events, 'Stop hook feedback:\nPlease fix lint first')
    expectSummaryMessage(result.events, {
      hookCount: 1,
      hookErrors: ['Please fix lint first'],
      preventedContinuation: false,
      toolUseID: 'stop-tool-2',
    })

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      key: 'stop-hook-error',
      priority: 'immediate',
    })
  })
})
