import { describe, expect, it } from 'bun:test'
import { z } from 'zod/v4'
import type { ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import type { AssistantMessage } from '../../types/message.js'
import type { Tool, ToolUseContext } from '../../Tool.js'
import { StreamingToolExecutor } from './StreamingToolExecutor.js'

function createAssistantMessage(toolUse: ToolUseBlock): AssistantMessage {
  return {
    type: 'assistant',
    uuid: 'assistant-uuid',
    message: {
      id: 'assistant-message-id',
      model: 'test-model',
      role: 'assistant',
      content: [toolUse],
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
      },
    },
  } as unknown as AssistantMessage
}

function createTool(): Tool {
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

function createToolUseContext(
  tool: Tool,
  setInProgressToolUseIDs: ToolUseContext['setInProgressToolUseIDs'],
): ToolUseContext {
  return {
    abortController: new AbortController(),
    options: {
      tools: [tool],
      commands: [],
      mcpClients: [],
      isNonInteractiveSession: false,
      mainLoopModel: 'test-model',
      agentDefinitions: {
        activeAgents: [],
        allowedAgentTypes: [],
      },
    },
    messages: [],
    getAppState: () =>
      ({
        toolPermissionContext: {
          mode: 'default',
          additionalWorkingDirectories: new Map(),
          alwaysAllowRules: {},
          alwaysDenyRules: {},
          alwaysAskRules: {},
          isBypassPermissionsModeAvailable: false,
        },
      }) as never,
    setAppState: () => {},
    setInProgressToolUseIDs,
    readFileState: { current: {} },
    addNotification: () => {},
  } as unknown as ToolUseContext
}

describe('StreamingToolExecutor', () => {
  it('converts executor setup failures into model-visible tool results', async () => {
    const tool = createTool()
    const toolUse: ToolUseBlock = {
      type: 'tool_use',
      id: 'toolu_1',
      name: 'FakeTool',
      input: {},
    }
    let setCalls = 0
    const context = createToolUseContext(tool, updater => {
      setCalls += 1
      if (setCalls === 1) {
        throw new Error('setInProgress failed')
      }
      return updater(new Set())
    })
    const executor = new StreamingToolExecutor(
      [tool],
      async () => ({ behavior: 'allow' }),
      context,
    )

    executor.addTool(toolUse, createAssistantMessage(toolUse))

    const updates = []
    for await (const update of executor.getRemainingResults()) {
      updates.push(update)
    }

    expect(updates).toHaveLength(1)
    const message = updates[0]!.message
    expect(message?.type).toBe('user')
    if (message?.type !== 'user' || !Array.isArray(message.message.content)) {
      throw new Error('expected user tool_result message')
    }
    const result = message.message.content[0]
    expect(result).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'toolu_1',
      is_error: true,
    })
    expect(result?.type === 'tool_result' ? result.content : '').toContain(
      'Internal tool executor error',
    )
  })
})
