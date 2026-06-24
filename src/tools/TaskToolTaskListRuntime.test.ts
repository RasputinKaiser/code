import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { randomUUID } from 'crypto'
import { getDefaultAppState } from '../state/AppStateStore.js'
import { resetTaskList } from '../utils/tasks.js'

const hookPaths = [
  import.meta.resolve('../utils/hooks.ts'),
  import.meta.resolve('../utils/hooks.js'),
]
const actualHooks = await import(import.meta.resolve('../utils/hooks.ts'))

for (const hooksPath of hookPaths) {
  mock.module(hooksPath, () => ({
    ...actualHooks,
    executeTaskCreatedHooks: async function* () {},
    executeTaskCompletedHooks: async function* () {},
    getTaskCreatedHookMessage: (blockingError: { blockingError: string }) =>
      `TaskCreated hook feedback:\n${blockingError.blockingError}`,
    getTaskCompletedHookMessage: (blockingError: { blockingError: string }) =>
      `TaskCompleted hook feedback:\n${blockingError.blockingError}`,
  }))
}

const { TaskCreateTool } = await import(
  import.meta.resolve('./TaskCreateTool/TaskCreateTool.ts')
)
const { TaskGetTool } = await import(
  import.meta.resolve('./TaskGetTool/TaskGetTool.ts')
)
const { TaskListTool } = await import(
  import.meta.resolve('./TaskListTool/TaskListTool.ts')
)
const { TaskUpdateTool } = await import(
  import.meta.resolve('./TaskUpdateTool/TaskUpdateTool.ts')
)

for (const hooksPath of hookPaths) {
  mock.module(hooksPath, () => actualHooks)
}

function createToolUseContext(
  tools: Array<{ name: string; userFacingName: () => string }>,
) {
  let appState = getDefaultAppState()

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

let previousTaskListId: string | undefined
let previousEnableTasks: string | undefined
let previousClaudeConfigDir: string | undefined
let previousNcodeConfigDir: string | undefined
let taskListId = ''
let configDir = ''

beforeEach(async () => {
  previousTaskListId = process.env.CLAUDE_CODE_TASK_LIST_ID
  previousEnableTasks = process.env.CLAUDE_CODE_ENABLE_TASKS
  previousClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
  previousNcodeConfigDir = process.env.NCODE_CONFIG_DIR
  taskListId = `task-tools-${randomUUID()}`
  configDir = `/tmp/ncode-task-tools-${randomUUID()}`
  process.env.CLAUDE_CODE_TASK_LIST_ID = taskListId
  process.env.CLAUDE_CODE_ENABLE_TASKS = '1'
  process.env.CLAUDE_CONFIG_DIR = configDir
  process.env.NCODE_CONFIG_DIR = configDir
  await resetTaskList(taskListId)
})

afterEach(async () => {
  await resetTaskList(taskListId)

  if (previousTaskListId === undefined) {
    delete process.env.CLAUDE_CODE_TASK_LIST_ID
  } else {
    process.env.CLAUDE_CODE_TASK_LIST_ID = previousTaskListId
  }

  if (previousEnableTasks === undefined) {
    delete process.env.CLAUDE_CODE_ENABLE_TASKS
  } else {
    process.env.CLAUDE_CODE_ENABLE_TASKS = previousEnableTasks
  }

  if (previousClaudeConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = previousClaudeConfigDir
  }

  if (previousNcodeConfigDir === undefined) {
    delete process.env.NCODE_CONFIG_DIR
  } else {
    process.env.NCODE_CONFIG_DIR = previousNcodeConfigDir
  }
})

describe('task-list tool runtime contract', () => {
  it('creates, retrieves, updates, and lists tasks through the real task-list storage', async () => {
    const toolUseContext = createToolUseContext([
      TaskCreateTool,
      TaskGetTool,
      TaskListTool,
      TaskUpdateTool,
    ])

    const blockerCreate = await TaskCreateTool.call!(
      {
        subject: 'Prepare fixtures',
        description: 'Set up the shared task fixtures',
      },
      toolUseContext,
      allowWithOriginalInput,
      {} as never,
    )
    const blockedCreate = await TaskCreateTool.call!(
      {
        subject: 'Run dependent check',
        description: 'Depends on the shared fixtures',
      },
      toolUseContext,
      allowWithOriginalInput,
      {} as never,
    )

    expect(blockerCreate.data.task).toEqual({
      id: '1',
      subject: 'Prepare fixtures',
    })
    expect(blockedCreate.data.task).toEqual({
      id: '2',
      subject: 'Run dependent check',
    })
    expect(toolUseContext.getAppState().expandedView).toBe('tasks')

    const dependencyUpdate = await TaskUpdateTool.call!(
      {
        taskId: '2',
        addBlockedBy: ['1'],
      },
      toolUseContext,
      allowWithOriginalInput,
      {} as never,
    )
    expect(dependencyUpdate.data).toMatchObject({
      success: true,
      taskId: '2',
      updatedFields: ['blockedBy'],
    })

    const blockedTask = await TaskGetTool.call!(
      {
        taskId: '2',
      },
      toolUseContext,
      allowWithOriginalInput,
      {} as never,
    )
    expect(blockedTask.data.task).toEqual({
      id: '2',
      subject: 'Run dependent check',
      description: 'Depends on the shared fixtures',
      status: 'pending',
      blocks: [],
      blockedBy: ['1'],
    })

    const blockerCompletion = await TaskUpdateTool.call!(
      {
        taskId: '1',
        status: 'completed',
      },
      toolUseContext,
      allowWithOriginalInput,
      {} as never,
    )
    expect(blockerCompletion.data).toMatchObject({
      success: true,
      taskId: '1',
      statusChange: {
        from: 'pending',
        to: 'completed',
      },
    })

    const listed = await TaskListTool.call!(
      {},
      toolUseContext,
      allowWithOriginalInput,
      {} as never,
    )
    const blockerSummary = listed.data.tasks.find(task => task.id === '1')
    const blockedSummary = listed.data.tasks.find(task => task.id === '2')

    expect(blockerSummary).toEqual({
      id: '1',
      subject: 'Prepare fixtures',
      status: 'completed',
      owner: undefined,
      blockedBy: [],
    })
    expect(blockedSummary).toEqual({
      id: '2',
      subject: 'Run dependent check',
      status: 'pending',
      owner: undefined,
      blockedBy: [],
    })
  })

  it('returns a structured not-found result for missing tasks', async () => {
    const toolUseContext = createToolUseContext([TaskGetTool, TaskUpdateTool])

    const getResult = await TaskGetTool.call!(
      {
        taskId: '999',
      },
      toolUseContext,
      allowWithOriginalInput,
      {} as never,
    )
    expect(getResult.data).toEqual({
      task: null,
    })

    const updateResult = await TaskUpdateTool.call!(
      {
        taskId: '999',
        subject: 'No-op',
      },
      toolUseContext,
      allowWithOriginalInput,
      {} as never,
    )
    expect(updateResult.data).toEqual({
      success: false,
      taskId: '999',
      updatedFields: [],
      error: 'Task not found',
    })
  })
})
