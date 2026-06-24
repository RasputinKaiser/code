import { afterEach, describe, expect, it, mock } from 'bun:test'
import { createTaskStateBase } from '../Task.js'
import { getDefaultAppState } from '../state/AppStateStore.js'
import { TaskOutputTool } from './TaskOutputTool/TaskOutputTool.js'
import { TaskStopTool } from './TaskStopTool/TaskStopTool.js'
import {
  _clearOutputsForTest,
  _resetTaskOutputDirForTest,
  appendTaskOutput,
  cleanupTaskOutput,
  flushTaskOutput,
} from '../utils/task/diskOutput.js'
import type { LocalShellTaskState } from '../tasks/LocalShellTask/guards.js'

function createToolUseContext(
  tools: Array<{ name: string; userFacingName: () => string }>,
  tasks: Record<string, LocalShellTaskState>,
) {
  let appState = {
    ...getDefaultAppState(),
    tasks,
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

function createLocalShellTaskState({
  id,
  status,
  description,
  command,
  shellCommand,
  exitCode,
}: {
  id: string
  status: LocalShellTaskState['status']
  description: string
  command: string
  shellCommand: LocalShellTaskState['shellCommand']
  exitCode?: number
}): LocalShellTaskState {
  return {
    ...createTaskStateBase(id, 'local_bash', description),
    status,
    command,
    result:
      exitCode === undefined
        ? undefined
        : {
            code: exitCode,
            interrupted: false,
          },
    completionStatusSentInAttachment: false,
    shellCommand,
    lastReportedTotalLines: 0,
    isBackgrounded: true,
  }
}

const createdTaskIds = new Set<string>()

afterEach(async () => {
  for (const taskId of createdTaskIds) {
    await cleanupTaskOutput(taskId)
  }
  createdTaskIds.clear()
  await _clearOutputsForTest()
  _resetTaskOutputDirForTest()
})

describe('background-task tool runtime contract', () => {
  it('validates and stops a running local bash task', async () => {
    const taskId = 'bstop-test'
    createdTaskIds.add(taskId)

    const kill = mock(() => {})
    const cleanup = mock(() => {})
    const task = createLocalShellTaskState({
      id: taskId,
      status: 'running',
      description: 'Run the background shell command',
      command: 'sleep 100',
      shellCommand: {
        kill,
        cleanup,
      } as never,
    })

    const toolUseContext = createToolUseContext([TaskStopTool], {
      [taskId]: task,
    })

    const validation = await TaskStopTool.validateInput!(
      {
        task_id: taskId,
      },
      toolUseContext,
    )
    expect(validation).toEqual({ result: true })

    const result = await TaskStopTool.call!(
      {
        task_id: taskId,
      },
      toolUseContext,
      allowWithOriginalInput,
      {} as never,
    )

    expect(kill).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(result.data).toMatchObject({
      task_id: taskId,
      task_type: 'local_bash',
      command: 'sleep 100',
    })
    expect(toolUseContext.getAppState().tasks[taskId]).toMatchObject({
      status: 'killed',
      notified: true,
      shellCommand: null,
    })
  })

  it('rejects TaskStop for tasks that are not running', async () => {
    const taskId = 'bstop-finished'
    createdTaskIds.add(taskId)

    const task = createLocalShellTaskState({
      id: taskId,
      status: 'completed',
      description: 'Finished task',
      command: 'echo done',
      shellCommand: null,
      exitCode: 0,
    })

    const toolUseContext = createToolUseContext([TaskStopTool], {
      [taskId]: task,
    })

    const validation = await TaskStopTool.validateInput!(
      {
        task_id: taskId,
      },
      toolUseContext,
    )

    expect(validation).toEqual({
      result: false,
      message: `Task ${taskId} is not running (status: completed)`,
      errorCode: 3,
    })
  })

  it('returns completed task output and marks the task notified', async () => {
    const taskId = 'boutput-success'
    createdTaskIds.add(taskId)

    appendTaskOutput(taskId, 'line one\nline two\n')
    await flushTaskOutput(taskId)

    const task = createLocalShellTaskState({
      id: taskId,
      status: 'completed',
      description: 'Run the test suite',
      command: 'bun test',
      shellCommand: null,
      exitCode: 0,
    })

    const toolUseContext = createToolUseContext([TaskOutputTool], {
      [taskId]: task,
    })

    const validation = await TaskOutputTool.validateInput!(
      {
        task_id: taskId,
      },
      toolUseContext,
    )
    expect(validation).toEqual({ result: true })

    const result = await TaskOutputTool.call!(
      {
        task_id: taskId,
        block: false,
        timeout: 50,
      },
      toolUseContext,
      allowWithOriginalInput,
      {} as never,
    )

    expect(result.data).toMatchObject({
      retrieval_status: 'success',
      task: {
        task_id: taskId,
        task_type: 'local_bash',
        status: 'completed',
        description: 'Run the test suite',
        output: 'line one\nline two\n',
        exitCode: 0,
      },
    })
    expect(toolUseContext.getAppState().tasks[taskId]).toMatchObject({
      notified: true,
    })
  })

  it('reports not_ready for running tasks on non-blocking reads', async () => {
    const taskId = 'boutput-running'
    createdTaskIds.add(taskId)

    appendTaskOutput(taskId, 'still running\n')
    await flushTaskOutput(taskId)

    const task = createLocalShellTaskState({
      id: taskId,
      status: 'running',
      description: 'Wait for completion',
      command: 'long-running',
      shellCommand: null,
    })

    const toolUseContext = createToolUseContext([TaskOutputTool], {
      [taskId]: task,
    })

    const result = await TaskOutputTool.call!(
      {
        task_id: taskId,
        block: false,
        timeout: 50,
      },
      toolUseContext,
      allowWithOriginalInput,
      {} as never,
    )

    expect(result.data).toMatchObject({
      retrieval_status: 'not_ready',
      task: {
        task_id: taskId,
        task_type: 'local_bash',
        status: 'running',
        description: 'Wait for completion',
        output: 'still running\n',
      },
    })
    expect(toolUseContext.getAppState().tasks[taskId]).toMatchObject({
      notified: false,
    })
  })
})
