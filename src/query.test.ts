import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { z } from 'zod/v4'

import {
  clearRegisteredHooks,
  getSessionId,
  getSessionTrustAccepted,
  registerHookCallbacks,
  setSessionTrustAccepted,
} from './bootstrap/state.js'
import type { QueryDeps } from './query/deps.js'
import {
  createAssistantAPIErrorMessage,
  createAssistantMessage,
} from './utils/messages.js'
import { addFunctionHook } from './utils/hooks/sessionHooks.js'
import { asSystemPrompt } from './utils/systemPromptType.js'
import type { Tool } from './Tool.js'

const stopHookCalls: unknown[][] = []
const stopFailureHookCalls: unknown[] = []

let previousTrustAccepted = false

const { query } = await import(import.meta.resolve('./query.ts'))

function createToolUseContext(options?: {
  tools?: Tool[]
  setInProgressToolUseIDs?: (
    updater: (prev: Set<string>) => Set<string>,
  ) => void
}) {
  let appState = {
    toolPermissionContext: { mode: 'default' },
    fastMode: false,
    sessionHooks: new Map(),
    mcp: {
      tools: [],
      clients: [],
    },
    effortValue: undefined,
    advisorModel: undefined,
  }

  return {
    abortController: new AbortController(),
    readFileState: {} as never,
    appendSystemMessage: () => {},
    getAppState: () => appState,
    setAppState: (updater: (prev: typeof appState) => typeof appState) => {
      appState = updater(appState)
    },
    updateAttributionState: () => {},
    messages: [],
    addNotification: () => {},
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'model-test',
      tools: options?.tools ?? [],
      verbose: false,
      thinkingConfig: {} as never,
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: false,
      agentDefinitions: {
        activeAgents: [],
        allowedAgentTypes: [],
      },
    },
    setInProgressToolUseIDs:
      options?.setInProgressToolUseIDs ?? (() => {}),
  }
}

function createFakeTool(): Tool {
  return {
    name: 'FakeTool',
    inputSchema: z.object({}),
    outputSchema: z.unknown(),
    description: async () => 'fake',
    isEnabled: () => true,
    isConcurrencySafe: () => false,
    isReadOnly: () => false,
    isDestructive: () => false,
    userFacingName: () => 'FakeTool',
    checkPermissions: async input => ({
      behavior: 'allow',
      updatedInput: input,
    }),
    toAutoClassifierInput: () => '',
    call: async () => ({
      data: 'ok',
    }),
    mapToolResultToToolResultBlockParam: (data, toolUseId) => ({
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: String(data),
    }),
  } as unknown as Tool
}

function registerStopHook(
  toolUseContext: ReturnType<typeof createToolUseContext>,
  callback: (messages: unknown[]) => boolean | Promise<boolean>,
  errorMessage: string,
) {
  addFunctionHook(
    toolUseContext.setAppState,
    getSessionId(),
    'Stop',
    '',
    async messages => {
      stopHookCalls.push([...messages])
      return callback(messages)
    },
    errorMessage,
  )
}

function registerStopFailureHook() {
  registerHookCallbacks({
    StopFailure: [
      {
        hooks: [
          {
            type: 'callback',
            callback: async input => {
              stopFailureHookCalls.push(input)
              return {}
            },
          },
        ],
      },
    ],
  })
}

function createDeps(
  callModel: (
    args: {
      messages: unknown[]
    },
  ) => AsyncGenerator<unknown, void>,
): QueryDeps {
  let uuidCounter = 0

  return {
    callModel: callModel as QueryDeps['callModel'],
    microcompact: (async (messages: unknown[]) => ({
      messages,
    })) as QueryDeps['microcompact'],
    autocompact: (async () => ({
      compactionResult: null,
      consecutiveFailures: undefined,
    })) as QueryDeps['autocompact'],
    uuid: () => `query-test-${++uuidCounter}`,
  }
}

async function collectQuery(
  stream: AsyncGenerator<unknown, unknown>,
): Promise<{
  events: unknown[]
  terminal: unknown
}> {
  const events: unknown[] = []

  while (true) {
    const next = await stream.next()
    if (next.done) {
      return {
        events,
        terminal: next.value,
      }
    }
    events.push(next.value)
  }
}

function expectMetaUserMessage(events: unknown[], content: string) {
  const userMessage = (events as Array<Record<string, unknown>>).find(
    event =>
      event.type === 'user' &&
      (event.message as { content?: unknown } | undefined)?.content === content,
  )

  expect(userMessage).toMatchObject({
    type: 'user',
    isMeta: true,
    message: {
      role: 'user',
      content,
    },
  })
}

beforeEach(() => {
  stopHookCalls.length = 0
  stopFailureHookCalls.length = 0
  clearRegisteredHooks()
  previousTrustAccepted = getSessionTrustAccepted()
  setSessionTrustAccepted(true)
})

afterEach(() => {
  clearRegisteredHooks()
  setSessionTrustAccepted(previousTrustAccepted)
})

describe('query recovery contracts', () => {
  it('retries max_output_tokens responses with a resume instruction instead of surfacing the first error', async () => {
    const toolUseContext = createToolUseContext()
    registerStopHook(toolUseContext, () => true, 'unexpected stop hook block')

    let modelCallCount = 0

    const result = await collectQuery(
      query({
        messages: [],
        systemPrompt: asSystemPrompt([]),
        userContext: {},
        systemContext: {},
        canUseTool: (async () => {
          throw new Error('unexpected tool permission check')
        }) as never,
        toolUseContext: toolUseContext as never,
        querySource: 'agent:test' as never,
        maxOutputTokensOverride: 8192,
        deps: createDeps(async function* (_args: {
          messages: unknown[]
        }) {
          modelCallCount += 1
          if (modelCallCount === 1) {
            yield createAssistantAPIErrorMessage({
              content: 'hit output cap',
              apiError: 'max_output_tokens',
            })
            return
          }
          yield createAssistantMessage({
            content: 'final answer',
          })
        }),
      }),
    )

    expect(result.terminal).toEqual({ reason: 'completed' })
    expect(
      result.events.filter(
        (event): event is { type: string; apiError?: string } =>
          typeof event === 'object' &&
          event !== null &&
          'type' in event &&
          typeof (event as { type: unknown }).type === 'string',
      ),
    ).not.toContainEqual(
      expect.objectContaining({
        type: 'assistant',
        apiError: 'max_output_tokens',
      }),
    )
    expect(
      result.events.filter(
        event =>
          typeof event === 'object' &&
          event !== null &&
          (event as { type?: string }).type === 'stream_request_start',
      ),
    ).toHaveLength(2)
    expect(modelCallCount).toBe(2)
    expect(stopHookCalls).toHaveLength(1)
    expect(stopFailureHookCalls).toEqual([])
  })

  it('skips stop hooks for API errors and routes them through stop-failure hooks', async () => {
    const toolUseContext = createToolUseContext()
    registerStopHook(toolUseContext, () => true, 'unexpected stop hook block')
    registerStopFailureHook()

    const result = await collectQuery(
      query({
        messages: [],
        systemPrompt: asSystemPrompt([]),
        userContext: {},
        systemContext: {},
        canUseTool: (async () => {
          throw new Error('unexpected tool permission check')
        }) as never,
        toolUseContext: toolUseContext as never,
        querySource: 'agent:test' as never,
        deps: createDeps(async function* () {
          yield createAssistantAPIErrorMessage({
            content: 'rate limited',
          })
        }),
      }),
    )

    expect(result.terminal).toEqual({ reason: 'completed' })
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'assistant',
        isApiErrorMessage: true,
      }),
    )
    expect(stopHookCalls).toEqual([])
    expect(stopFailureHookCalls).toHaveLength(1)
    expect(stopFailureHookCalls[0]).toMatchObject({
      hook_event_name: 'StopFailure',
      last_assistant_message: 'rate limited',
    })
  })

  it('retries after stop-hook blocking feedback', async () => {
    const toolUseContext = createToolUseContext()
    let stopHookAttempt = 0
    registerStopHook(
      toolUseContext,
      () => {
        stopHookAttempt += 1
        return stopHookAttempt > 1
      },
      'Need more detail',
    )

    let modelCallCount = 0

    const result = await collectQuery(
      query({
        messages: [],
        systemPrompt: asSystemPrompt([]),
        userContext: {},
        systemContext: {},
        canUseTool: (async () => {
          throw new Error('unexpected tool permission check')
        }) as never,
        toolUseContext: toolUseContext as never,
        querySource: 'agent:test' as never,
        deps: createDeps(async function* (_args: {
          messages: unknown[]
        }) {
          modelCallCount += 1
          if (modelCallCount === 1) {
            yield createAssistantMessage({
              content: 'draft answer',
            })
            return
          }
          yield createAssistantMessage({
            content: 'final answer',
          })
        }),
      }),
    )

    expect(result.terminal).toEqual({ reason: 'completed' })
    expect(modelCallCount).toBe(2)
    expect(stopHookCalls).toHaveLength(2)
    expectMetaUserMessage(
      result.events,
      'Stop hook feedback:\nNeed more detail',
    )
    expect(stopFailureHookCalls).toEqual([])
  })

  it('turns tool execution phase failures into missing tool results and continues', async () => {
    const toolUse = {
      type: 'tool_use' as const,
      id: 'toolu_query_failure',
      name: 'FakeTool',
      input: {},
    }
    let setInProgressCalls = 0
    const toolUseContext = createToolUseContext({
      tools: [createFakeTool()],
      setInProgressToolUseIDs: updater => {
        setInProgressCalls += 1
        if (setInProgressCalls === 1) {
          throw new Error('in-progress state failed')
        }
        updater(new Set())
      },
    })
    let modelCallCount = 0
    let secondCallMessages: unknown[] = []

    const result = await collectQuery(
      query({
        messages: [],
        systemPrompt: asSystemPrompt([]),
        userContext: {},
        systemContext: {},
        canUseTool: (async () => ({
          behavior: 'allow',
        })) as never,
        toolUseContext: toolUseContext as never,
        querySource: 'agent:test' as never,
        deps: createDeps(async function* (args: { messages: unknown[] }) {
          modelCallCount += 1
          if (modelCallCount === 1) {
            yield createAssistantMessage({
              content: [toolUse],
            })
            return
          }
          secondCallMessages = args.messages
          yield createAssistantMessage({
            content: 'recovered',
          })
        }),
      }),
    )

    expect(result.terminal).toEqual({ reason: 'completed' })
    expect(modelCallCount).toBe(2)
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'user',
        message: expect.objectContaining({
          content: [
            expect.objectContaining({
              type: 'tool_result',
              tool_use_id: 'toolu_query_failure',
              is_error: true,
            }),
          ],
        }),
      }),
    )
    expect(secondCallMessages).toContainEqual(
      expect.objectContaining({
        type: 'user',
        message: expect.objectContaining({
          role: 'user',
          content: [
            expect.objectContaining({
              type: 'tool_result',
              tool_use_id: 'toolu_query_failure',
              is_error: true,
            }),
          ],
        }),
      }),
    )
  })

  it('recovers when the model ends a turn with thinking only', async () => {
    const toolUseContext = createToolUseContext()
    let modelCallCount = 0
    let secondCallMessages: unknown[] = []

    const result = await collectQuery(
      query({
        messages: [],
        systemPrompt: asSystemPrompt([]),
        userContext: {},
        systemContext: {},
        canUseTool: (async () => {
          throw new Error('unexpected tool permission check')
        }) as never,
        toolUseContext: toolUseContext as never,
        querySource: 'agent:test' as never,
        deps: createDeps(async function* (args: { messages: unknown[] }) {
          modelCallCount += 1
          if (modelCallCount === 1) {
            yield createAssistantMessage({
              content: [
                {
                  type: 'thinking',
                  thinking: 'I should call WebFetch.',
                  signature: '',
                } as never,
              ],
            })
            return
          }
          secondCallMessages = args.messages
          yield createAssistantMessage({
            content: 'visible answer',
          })
        }),
      }),
    )

    expect(result.terminal).toEqual({ reason: 'completed' })
    expect(modelCallCount).toBe(2)
    expect(secondCallMessages).toContainEqual(
      expect.objectContaining({
        type: 'user',
        isMeta: true,
        message: expect.objectContaining({
          content: expect.stringContaining('MUST either call the intended tool'),
        }),
      }),
    )
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'assistant',
        message: expect.objectContaining({
          content: [
            expect.objectContaining({
              type: 'text',
              text: 'visible answer',
            }),
          ],
        }),
      }),
    )
  })

  it('does not surface thinking-only recovery exhaustion as transcript noise', async () => {
    const toolUseContext = createToolUseContext()
    let modelCallCount = 0

    const result = await collectQuery(
      query({
        messages: [],
        systemPrompt: asSystemPrompt([]),
        userContext: {},
        systemContext: {},
        canUseTool: (async () => {
          throw new Error('unexpected tool permission check')
        }) as never,
        toolUseContext: toolUseContext as never,
        querySource: 'agent:test' as never,
        deps: createDeps(async function* () {
          modelCallCount += 1
          yield createAssistantMessage({
            content: [
              {
                type: 'thinking',
                thinking: 'I should call WebFetch.',
                signature: '',
              } as never,
            ],
          })
        }),
      }),
    )

    expect(result.terminal).toEqual({
      reason: 'model_error',
      error: 'thinking_only_response',
    })
    expect(modelCallCount).toBe(4)
    expect(result.events).not.toContainEqual(
      expect.objectContaining({
        isApiErrorMessage: true,
        message: expect.objectContaining({
          content: [
            expect.objectContaining({
              text: expect.stringContaining('Model returned internal reasoning'),
            }),
          ],
        }),
      }),
    )
  })

  it('retries malformed model protocol output without surfacing the intermediate API error', async () => {
    const toolUseContext = createToolUseContext()
    let modelCallCount = 0
    let secondCallMessages: unknown[] = []

    const result = await collectQuery(
      query({
        messages: [],
        systemPrompt: asSystemPrompt([]),
        userContext: {},
        systemContext: {},
        canUseTool: (async () => {
          throw new Error('unexpected tool permission check')
        }) as never,
        toolUseContext: toolUseContext as never,
        querySource: 'agent:test' as never,
        deps: createDeps(async function* (args: { messages: unknown[] }) {
          modelCallCount += 1
          if (modelCallCount === 1) {
            yield createAssistantAPIErrorMessage({
              content:
                'API Error: Malformed unary tool output leaked from backend response',
              apiError: 'malformed_tool_output',
              error: 'invalid_request',
            })
            return
          }
          secondCallMessages = args.messages
          yield createAssistantMessage({
            content: 'recovered answer',
          })
        }),
      }),
    )

    expect(result.terminal).toEqual({ reason: 'completed' })
    expect(modelCallCount).toBe(2)
    expect(result.events).not.toContainEqual(
      expect.objectContaining({
        type: 'assistant',
        apiError: 'malformed_tool_output',
      }),
    )
    expect(secondCallMessages).toContainEqual(
      expect.objectContaining({
        type: 'user',
        isMeta: true,
        message: expect.objectContaining({
          content: expect.stringContaining('structured tool interface'),
        }),
      }),
    )
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'assistant',
        message: expect.objectContaining({
          content: [
            expect.objectContaining({
              type: 'text',
              text: 'recovered answer',
            }),
          ],
        }),
      }),
    )
  })

  it('surfaces malformed model protocol output after bounded recovery exhaustion', async () => {
    const toolUseContext = createToolUseContext()
    let modelCallCount = 0

    const result = await collectQuery(
      query({
        messages: [],
        systemPrompt: asSystemPrompt([]),
        userContext: {},
        systemContext: {},
        canUseTool: (async () => {
          throw new Error('unexpected tool permission check')
        }) as never,
        toolUseContext: toolUseContext as never,
        querySource: 'agent:test' as never,
        deps: createDeps(async function* () {
          modelCallCount += 1
          yield createAssistantAPIErrorMessage({
            content:
              'API Error: Malformed unary tool output leaked from backend response',
            apiError: 'malformed_tool_output',
            error: 'invalid_request',
          })
        }),
      }),
    )

    expect(result.terminal).toEqual({ reason: 'completed' })
    expect(modelCallCount).toBe(2)
    expect(
      result.events.filter(
        event =>
          typeof event === 'object' &&
          event !== null &&
          (event as { type?: string }).type === 'assistant' &&
          (event as { apiError?: string }).apiError ===
            'malformed_tool_output',
      ),
    ).toHaveLength(1)
  })
})
