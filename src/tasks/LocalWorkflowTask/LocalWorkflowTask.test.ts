import { afterEach, describe, expect, it } from 'bun:test'
import { getDefaultAppState } from '../../state/AppStateStore.js'
import { clearPendingNotifications } from '../../utils/messageQueueManager.js'
import {
  _clearOutputsForTest,
  _resetTaskOutputDirForTest,
} from '../../utils/task/diskOutput.js'
import {
  completeWorkflowAgent,
  failWorkflowAgent,
  finalizeWorkflowTask,
  killWorkflowTask,
  registerWorkflowTask,
  startWorkflowAgent,
} from './LocalWorkflowTask.js'

function createTaskStateHarness() {
  let appState = getDefaultAppState()

  const setAppState = (updater: (prev: typeof appState) => typeof appState) => {
    appState = updater(appState)
  }

  return {
    getAppState: () => appState,
    setAppState,
  }
}

afterEach(async () => {
  clearPendingNotifications()
  _resetTaskOutputDirForTest()
  await _clearOutputsForTest()
})

describe('LocalWorkflowTask', () => {
  it('tracks per-agent lifecycle and final task counts', () => {
    const { getAppState, setAppState } = createTaskStateHarness()
    const abortController = new AbortController()
    const task = registerWorkflowTask(setAppState, {
      workflowName: 'release',
      objective: 'Prepare the release plan',
      executionMode: 'sequential',
      abortController,
      agents: [
        {
          id: 'agent-a',
          name: 'research',
          description: 'Inspect the repo',
          prompt: 'Inspect the repo',
          agentType: 'general-purpose',
        },
        {
          id: 'agent-b',
          name: 'writeup',
          description: 'Draft the summary',
          prompt: 'Draft the summary',
          agentType: 'general-purpose',
        },
        {
          id: 'agent-c',
          name: 'left-pending',
          description: 'Unstarted pending agent',
          prompt: 'Wait',
          agentType: 'general-purpose',
        },
      ],
    })

    startWorkflowAgent(task.id, 'agent-a', setAppState)
    completeWorkflowAgent(task.id, 'agent-a', setAppState, {
      summary: 'Inspected the relevant modules.',
      tokenCount: 42,
      toolUseCount: 2,
    })
    startWorkflowAgent(task.id, 'agent-b', setAppState)
    failWorkflowAgent(task.id, 'agent-b', setAppState, {
      error: 'Agent failed to produce a summary.',
      summary: 'Partial output',
      tokenCount: 11,
      toolUseCount: 1,
    })
    finalizeWorkflowTask(task.id, setAppState, {
      status: 'failed',
      error: 'One or more workflow agents failed.',
    })

    const updated = getAppState().tasks[task.id]
    expect(updated).toMatchObject({
      type: 'local_workflow',
      status: 'failed',
      completedCount: 1,
      failedCount: 1,
      killedCount: 1,
      error: 'One or more workflow agents failed.',
    })

    if (!updated || updated.type !== 'local_workflow') {
      throw new Error('expected workflow task state')
    }

    expect(updated.agents.map(agent => agent.status)).toEqual([
      'completed',
      'failed',
      'killed',
    ])
  })

  it('kills running workflows and aborts the controller', async () => {
    const { getAppState, setAppState } = createTaskStateHarness()
    const abortController = new AbortController()
    const task = registerWorkflowTask(setAppState, {
      workflowName: 'release',
      objective: 'Prepare the release plan',
      executionMode: 'parallel',
      abortController,
      agents: [
        {
          id: 'agent-a',
          name: 'research',
          description: 'Inspect the repo',
          prompt: 'Inspect the repo',
          agentType: 'general-purpose',
        },
      ],
    })

    startWorkflowAgent(task.id, 'agent-a', setAppState)
    await killWorkflowTask(task.id, setAppState)

    expect(abortController.signal.aborted).toBe(true)

    const updated = getAppState().tasks[task.id]
    expect(updated).toMatchObject({
      type: 'local_workflow',
      status: 'killed',
      killedCount: 1,
    })
  })
})
