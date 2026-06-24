import { afterEach, describe, expect, it } from 'bun:test'
import type { HookProgress } from '../types/hooks.js'
import type { Message } from '../types/message.js'
import { deriveNextReplMessageSignalState } from './replMessageSignals.js'

function createUserMessage(uuid: string): Message {
  return {
    type: 'user',
    uuid,
    message: {
      content: 'user prompt',
    },
  } as unknown as Message
}

function createAssistantMessage(
  uuid: string,
  usage?: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  },
  options?: {
    toolUses?: Array<{
      id: string
      name: string
    }>
  },
): Message {
  return {
    type: 'assistant',
    uuid,
    message: {
      id: `assistant-${uuid}`,
      model: 'claude-test',
      content: [
        {
          type: 'text',
          text: 'assistant reply',
        },
        ...(options?.toolUses ?? []).map(toolUse => ({
          type: 'tool_use',
          id: toolUse.id,
          name: toolUse.name,
          input: {},
        })),
      ],
      ...(usage ? { usage } : {}),
    },
  } as unknown as Message
}

function createStopHookProgress(
  uuid: string,
  toolUseID: string,
  command: string,
  overrides: Partial<HookProgress> = {},
): Message {
  return {
    type: 'progress',
    uuid,
    toolUseID,
    parentToolUseID: 'parent-tool-use',
    timestamp: '2026-04-13T00:00:00.000Z',
    data: {
      type: 'hook_progress',
      hookEvent: 'Stop',
      hookName: `stop-hook-${uuid}`,
      command,
      ...overrides,
    },
  } as unknown as Message
}

function createStopHookAttachment(uuid: string, toolUseID: string): Message {
  return {
    type: 'attachment',
    uuid,
    attachment: {
      type: 'hook_success',
      toolUseID,
      hookEvent: 'Stop',
      hookName: `stop-hook-${uuid}`,
      stdout: '',
      stderr: '',
    },
  } as unknown as Message
}

function createStopHookSummary(uuid: string, toolUseID: string): Message {
  return {
    type: 'system',
    uuid,
    subtype: 'stop_hook_summary',
    toolUseID,
  } as unknown as Message
}

function derive(
  messages: Message[],
  isLoading = true,
  previous: ReturnType<typeof deriveNextReplMessageSignalState> | null = null,
) {
  return deriveNextReplMessageSignalState(previous, messages, isLoading)
}

const originalUserType = process.env.USER_TYPE

afterEach(() => {
  process.env.USER_TYPE = originalUserType
})

describe('deriveNextReplMessageSignalState', () => {
  it('matches a full recompute across append-only stop-hook updates', () => {
    const user = createUserMessage('u1')
    const progress1 = createStopHookProgress('p1', 'stop-tool-1', 'echo first', {
      statusMessage: 'cleaning up',
    })
    const attachment1 = createStopHookAttachment('a1', 'stop-tool-1')
    const progress2 = createStopHookProgress('p2', 'stop-tool-1', 'echo second')
    const summary = createStopHookSummary('s1', 'stop-tool-1')

    const steps = [
      [user],
      [user, progress1],
      [user, progress1, attachment1],
      [user, progress1, attachment1, progress2],
      [user, progress1, attachment1, progress2, summary],
    ]

    let incremental = derive([], true)

    for (const step of steps) {
      incremental = derive(step, true, incremental)
      const full = derive(step, true)
      expect(incremental.signals).toEqual(full.signals)
    }

    expect(derive([user, progress1], true).signals.stopHookSpinnerSuffix).toBe(
      'cleaning up…',
    )
    expect(
      derive([user, progress1, attachment1, progress2], true).signals
        .stopHookSpinnerSuffix,
    ).toBe('cleaning up… 1/2')
    expect(
      derive([user, progress1, attachment1, progress2, summary], true).signals
        .stopHookSpinnerSuffix,
    ).toBeNull()
  })

  it('falls back when the latest assistant message is replaced in place', () => {
    const user = createUserMessage('u1')
    const assistantWithoutUsage = createAssistantMessage('a1')
    const before = [user, assistantWithoutUsage]
    const previous = derive(before, true)

    const assistantWithUsage = createAssistantMessage('a1', {
      input_tokens: 11,
      output_tokens: 7,
      cache_creation_input_tokens: 3,
      cache_read_input_tokens: 2,
    })
    const after = [user, assistantWithUsage]

    const next = derive(after, true, previous)

    expect(next.signals.lastAssistantMessageId).toBe('a1')
    expect(next.signals.lastApiUsageKey).toBe('a1:11:7:3:2')
  })

  it('preserves the ant-specific stop-hook label semantics', () => {
    process.env.USER_TYPE = 'ant'

    const progress1 = createStopHookProgress('p1', 'stop-tool-2', 'echo first')
    const progress2 = createStopHookProgress('p2', 'stop-tool-2', 'echo second')
    const attachment1 = createStopHookAttachment('a1', 'stop-tool-2')

    const state = derive([progress1, progress2, attachment1], true)

    expect(state.signals.stopHookSpinnerSuffix).toBe(
      "running stop hook 'echo second'… 1/2",
    )
  })

  it('tracks the most recent assistant tool uses incrementally', () => {
    const user = createUserMessage('u1')
    const firstAssistant = createAssistantMessage('a1', undefined, {
      toolUses: [{ id: 'tool-1', name: 'Read' }],
    })
    const secondAssistant = createAssistantMessage('a2', undefined, {
      toolUses: [
        { id: 'tool-2', name: 'Sleep' },
        { id: 'tool-3', name: 'Sleep' },
      ],
    })

    const previous = derive([user, firstAssistant], true)
    const incremental = derive(
      [user, firstAssistant, secondAssistant],
      true,
      previous,
    )
    const full = derive([user, firstAssistant, secondAssistant], true)

    expect(incremental.signals.lastAssistantToolUses).toEqual([
      { id: 'tool-2', name: 'Sleep' },
      { id: 'tool-3', name: 'Sleep' },
    ])
    expect(incremental.signals).toEqual(full.signals)
  })

  it('fast-paths in-place replacement of non-assistant last messages', () => {
    const user = createUserMessage('u1')
    const assistant = createAssistantMessage('a1', {
      input_tokens: 10,
      output_tokens: 5,
    })

    const progress1 = {
      type: 'progress',
      uuid: 'p1',
      parentToolUseID: 'parent-1',
      toolUseID: 'tool-1',
      timestamp: '2026-04-13T00:00:00.000Z',
      data: { type: 'bash_progress', elapsedTimeSeconds: 1, taskId: 't1' },
      message: { content: [] },
    } as unknown as Message

    const progress2 = {
      type: 'progress',
      uuid: 'p2',
      parentToolUseID: 'parent-1',
      toolUseID: 'tool-1',
      timestamp: '2026-04-13T00:00:00.000Z',
      data: { type: 'bash_progress', elapsedTimeSeconds: 2, taskId: 't1' },
      message: { content: [] },
    } as unknown as Message

    const before = [user, assistant, progress1]
    const previous = derive(before, true)

    // Replace the last progress message in place
    const after = [user, assistant, progress2]
    const incremental = derive(after, true, previous)
    const full = derive(after, true)

    // Signals should match full recompute exactly
    expect(incremental.signals).toEqual(full.signals)
    // Prompt signals should be preserved from the assistant (not progress)
    expect(incremental.signals.lastAssistantMessageId).toBe('a1')
    expect(incremental.signals.lastApiUsageKey).toBe('a1:10:5:0:0')
  })
})
