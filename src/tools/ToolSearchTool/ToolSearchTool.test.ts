import { describe, expect, it } from 'bun:test'
import { z } from 'zod/v4'
import { getDefaultAppState } from '../../state/AppStateStore.js'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { ToolSearchTool } from './ToolSearchTool.js'

function createToolUseContext(
  tools: Array<{ name: string; userFacingName: () => string }>,
  pendingServerNames: string[] = [],
) {
  let appState = getDefaultAppState()
  appState = {
    ...appState,
    mcp: {
      ...appState.mcp,
      clients: pendingServerNames.map(name => ({ type: 'pending', name })) as never,
    },
  }

  const setAppState = (updater: (prev: typeof appState) => typeof appState) => {
    appState = updater(appState)
  }

  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: '/data/models/hf/moonshotai__Kimi-K2.7-Code',
      tools: tools as never,
      verbose: false,
      thinkingConfig: {} as never,
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: {
        activeAgents: [],
        allAgents: [],
      },
    },
    abortController: new AbortController(),
    readFileState: {} as never,
    getAppState: () => appState,
    setAppState,
    setAppStateForTasks: setAppState,
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
    messages: [],
  } as never
}

async function allowWithOriginalInput<T>(_tool: unknown, input: T) {
  return {
    behavior: 'allow' as const,
    updatedInput: input,
  }
}

const noopInputSchema = lazySchema(() => z.strictObject({}))
const noopOutputSchema = lazySchema(() =>
  z.strictObject({
    ok: z.boolean(),
  }),
)

function createFakeTool({
  name,
  promptText,
  searchHint,
  shouldDefer = false,
}: {
  name: string
  promptText: string
  searchHint?: string
  shouldDefer?: boolean
}) {
  return buildTool({
    name,
    searchHint,
    shouldDefer,
    async description() {
      return promptText
    },
    get inputSchema() {
      return noopInputSchema()
    },
    get outputSchema() {
      return noopOutputSchema()
    },
    isReadOnly() {
      return true
    },
    async prompt() {
      return promptText
    },
    renderToolUseMessage() {
      return name
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
      return {
        type: 'tool_result',
        tool_use_id: toolUseID,
        content: content.ok ? 'ok' : 'not ok',
      }
    },
    async call() {
      return {
        data: {
          ok: true,
        },
      }
    },
  })
}

describe('ToolSearchTool runtime contract', () => {
  it('selects a deferred tool by exact name', async () => {
    const ReadTool = createFakeTool({
      name: 'Read',
      promptText: 'Read a file from disk.',
    })
    const TaskGetTool = createFakeTool({
      name: 'TaskGet',
      promptText: 'Fetch a task by id.',
      shouldDefer: true,
    })
    const TaskListTool = createFakeTool({
      name: 'TaskList',
      promptText: 'List tasks.',
      shouldDefer: true,
    })

    const result = await ToolSearchTool.call!(
      {
        query: 'select:TaskGet',
        max_results: 5,
      },
      createToolUseContext([ToolSearchTool, ReadTool, TaskGetTool, TaskListTool]),
      allowWithOriginalInput,
      {} as never,
    )

    expect(result.data).toEqual({
      matches: ['TaskGet'],
      query: 'select:TaskGet',
      total_deferred_tools: 2,
    })
  })

  it('returns an already-loaded tool for select queries so the model can proceed without retry churn', async () => {
    const ReadTool = createFakeTool({
      name: 'Read',
      promptText: 'Read a file from disk.',
    })
    const TaskGetTool = createFakeTool({
      name: 'TaskGet',
      promptText: 'Fetch a task by id.',
      shouldDefer: true,
    })

    const result = await ToolSearchTool.call!(
      {
        query: 'select:Read',
        max_results: 5,
      },
      createToolUseContext([ToolSearchTool, ReadTool, TaskGetTool]),
      allowWithOriginalInput,
      {} as never,
    )

    expect(result.data).toEqual({
      matches: ['Read'],
      query: 'select:Read',
      total_deferred_tools: 1,
    })
  })

  it('searches only deferred tools for keyword queries', async () => {
    const ReadNotebookTool = createFakeTool({
      name: 'ReadNotebook',
      promptText: 'Read notebook files.',
      searchHint: 'jupyter notebook reader',
    })
    const NotebookEditTool = createFakeTool({
      name: 'NotebookEdit',
      promptText: 'Edit notebook cells and metadata.',
      searchHint: 'jupyter notebook editor',
      shouldDefer: true,
    })
    const TaskGetTool = createFakeTool({
      name: 'TaskGet',
      promptText: 'Fetch a task by id.',
      searchHint: 'inspect task details',
      shouldDefer: true,
    })

    const result = await ToolSearchTool.call!(
      {
        query: 'jupyter notebook',
        max_results: 5,
      },
      createToolUseContext([
        ToolSearchTool,
        ReadNotebookTool,
        NotebookEditTool,
        TaskGetTool,
      ]),
      allowWithOriginalInput,
      {} as never,
    )

    expect(result.data).toEqual({
      matches: ['NotebookEdit'],
      query: 'jupyter notebook',
      total_deferred_tools: 2,
    })
  })

  it('returns tool_reference blocks for matched tools', () => {
    const resultBlock = ToolSearchTool.mapToolResultToToolResultBlockParam(
      {
        matches: ['TaskGet', 'TaskList'],
        query: 'select:TaskGet,TaskList',
        total_deferred_tools: 2,
      },
      'toolu_123',
    ) as {
      type: string
      tool_use_id: string
      content: Array<{ type: string; tool_name: string }>
    }

    expect(resultBlock).toEqual({
      type: 'tool_result',
      tool_use_id: 'toolu_123',
      content: [
        { type: 'tool_reference', tool_name: 'TaskGet' },
        { type: 'tool_reference', tool_name: 'TaskList' },
      ],
    })
  })

  it('includes pending MCP servers when no deferred tools match', async () => {
    const NotebookEditTool = createFakeTool({
      name: 'NotebookEdit',
      promptText: 'Edit notebook cells and metadata.',
      searchHint: 'jupyter notebook editor',
      shouldDefer: true,
    })

    const result = await ToolSearchTool.call!(
      {
        query: 'slack send message',
        max_results: 5,
      },
      createToolUseContext([ToolSearchTool, NotebookEditTool], ['slack', 'github']),
      allowWithOriginalInput,
      {} as never,
    )

    expect(result.data).toEqual({
      matches: [],
      query: 'slack send message',
      total_deferred_tools: 1,
      pending_mcp_servers: ['slack', 'github'],
    })

    const resultBlock = ToolSearchTool.mapToolResultToToolResultBlockParam(
      result.data,
      'toolu_456',
    ) as {
      type: string
      tool_use_id: string
      content: string
    }

    expect(resultBlock.type).toBe('tool_result')
    expect(resultBlock.tool_use_id).toBe('toolu_456')
    expect(resultBlock.content).toContain('No matching deferred tools found')
    expect(resultBlock.content).toContain('slack, github')
  })
})
