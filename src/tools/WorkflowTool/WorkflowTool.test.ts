import { afterEach, describe, expect, it } from 'bun:test'
import { clearPendingNotifications } from '../../utils/messageQueueManager.js'
import {
  _clearOutputsForTest,
  _resetTaskOutputDirForTest,
} from '../../utils/task/diskOutput.js'
import { getDefaultAppState } from '../../state/AppStateStore.js'
import { GENERAL_PURPOSE_AGENT } from '../AgentTool/built-in/generalPurposeAgent.js'
import {
  __setWorkflowRuntimeForTests,
  WorkflowTool,
} from './WorkflowTool.js'

function createToolUseContext() {
  let appState = getDefaultAppState()

  const setAppState = (updater: (prev: typeof appState) => typeof appState) => {
    appState = updater(appState)
  }

  return {
    getAppState: () => appState,
    setAppState,
    setAppStateForTasks: setAppState,
    context: {
      options: {
        commands: [],
        debug: false,
        mainLoopModel: 'opus',
        tools: [],
        verbose: false,
        thinkingConfig: {} as never,
        mcpClients: [],
        mcpResources: {},
        isNonInteractiveSession: false,
        agentDefinitions: {
          activeAgents: [GENERAL_PURPOSE_AGENT],
          allAgents: [GENERAL_PURPOSE_AGENT],
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
    },
  }
}

afterEach(async () => {
  __setWorkflowRuntimeForTests()
  clearPendingNotifications()
  _resetTaskOutputDirForTest()
  await _clearOutputsForTest()
})

describe('WorkflowTool', () => {
  it('registers a workflow task and launches the injected runtime', async () => {
    const { context, getAppState } = createToolUseContext()
    let capturedParams: { taskId: string; workflowName: string } | undefined

    __setWorkflowRuntimeForTests(async params => {
      capturedParams = {
        taskId: params.taskId,
        workflowName: params.workflowName,
      }
    })

    const result = await WorkflowTool.call(
      {
        workflow_name: 'spec-flow',
        objective: 'Draft the implementation spec',
        execution: 'parallel',
        agents: [
          {
            name: 'research',
            prompt: 'Inspect the codebase and summarize the relevant modules.',
          },
        ],
      },
      context as never,
      (() => ({ result: true })) as never,
      { requestId: 'req-workflow' } as never,
    )

    expect(result.data).toMatchObject({
      status: 'async_launched',
      workflowName: 'spec-flow',
      agentCount: 1,
      execution: 'parallel',
    })
    expect(capturedParams).toEqual({
      taskId: result.data.taskId,
      workflowName: 'spec-flow',
    })

    const task = getAppState().tasks[result.data.taskId!]
    expect(task).toMatchObject({
      type: 'local_workflow',
      workflowName: 'spec-flow',
      objective: 'Draft the implementation spec',
      executionMode: 'parallel',
      agentCount: 1,
      status: 'running',
    })
  })

  it('rejects workflow launches from subagents', async () => {
    const { context } = createToolUseContext()

    const result = await WorkflowTool.call(
      {
        workflow_name: 'spec-flow',
        objective: 'Draft the implementation spec',
        execution: 'sequential',
        agents: [
          {
            name: 'research',
            prompt: 'Inspect the codebase and summarize the relevant modules.',
          },
        ],
      },
      { ...context, agentId: 'agent-subtask' } as never,
      (() => ({ result: true })) as never,
      { requestId: 'req-workflow' } as never,
    )

    expect(result.data).toEqual({
      status: 'disabled',
      message:
        'Workflow must be called from the main thread, not from a subagent.',
    })
  })
})
