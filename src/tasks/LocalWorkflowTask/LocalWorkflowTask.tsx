import {
  OUTPUT_FILE_TAG,
  STATUS_TAG,
  SUMMARY_TAG,
  TASK_ID_TAG,
  TASK_NOTIFICATION_TAG,
  TASK_TYPE_TAG,
  TOOL_USE_ID_TAG,
} from '../../constants/xml.js'
import type { TaskStatus } from '../../Task.js'
import {
  createTaskStateBase,
  generateTaskId,
  type SetAppState,
  type Task,
  type TaskStateBase,
} from '../../Task.js'
import { asAgentId } from '../../types/ids.js'
import { enqueuePendingNotification } from '../../utils/messageQueueManager.js'
import { getAgentTranscriptPath } from '../../utils/sessionStorage.js'
import { evictTaskOutput, getTaskOutputPath } from '../../utils/task/diskOutput.js'
import { registerTask, updateTaskState } from '../../utils/task/framework.js'

export type WorkflowExecutionMode = 'parallel' | 'sequential'

export type WorkflowAgentState = {
  id: string
  name: string
  description: string
  prompt: string
  agentType: string
  model?: string
  status: TaskStatus
  outputFile: string
  startTime?: number
  endTime?: number
  tokenCount: number
  toolUseCount: number
  summary?: string
  error?: string
}

export type WorkflowAgentDescriptor = {
  id: string
  name: string
  description: string
  prompt: string
  agentType: string
  model?: string
}

export type LocalWorkflowTaskState = TaskStateBase & {
  type: 'local_workflow'
  workflowName: string
  summary?: string
  objective: string
  executionMode: WorkflowExecutionMode
  agentCount: number
  completedCount: number
  failedCount: number
  killedCount: number
  agents: WorkflowAgentState[]
  abortController?: AbortController
  agentControllers?: Record<string, AbortController>
  error?: string
}

function buildInitialAgents(
  agents: WorkflowAgentDescriptor[],
): WorkflowAgentState[] {
  return agents.map(agent => ({
    ...agent,
    status: 'pending',
    outputFile: getAgentTranscriptPath(asAgentId(agent.id)),
    tokenCount: 0,
    toolUseCount: 0,
  }))
}

function countAgents(agents: WorkflowAgentState[]): Pick<
  LocalWorkflowTaskState,
  'completedCount' | 'failedCount' | 'killedCount'
> {
  let completedCount = 0
  let failedCount = 0
  let killedCount = 0

  for (const agent of agents) {
    if (agent.status === 'completed') completedCount += 1
    if (agent.status === 'failed') failedCount += 1
    if (agent.status === 'killed') killedCount += 1
  }

  return { completedCount, failedCount, killedCount }
}

function updateWorkflowTask(
  taskId: string,
  setAppState: SetAppState,
  updater: (task: LocalWorkflowTaskState) => LocalWorkflowTaskState,
): void {
  updateTaskState<LocalWorkflowTaskState>(taskId, setAppState, task => {
    if (task.type !== 'local_workflow') {
      return task
    }
    return updater(task)
  })
}

function updateWorkflowAgent(
  taskId: string,
  agentId: string,
  setAppState: SetAppState,
  updater: (agent: WorkflowAgentState) => WorkflowAgentState,
): void {
  updateWorkflowTask(taskId, setAppState, task => {
    const index = task.agents.findIndex(agent => agent.id === agentId)
    if (index === -1) {
      return task
    }

    const currentAgent = task.agents[index]
    if (!currentAgent) {
      return task
    }

    const nextAgent = updater(currentAgent)
    if (nextAgent === currentAgent) {
      return task
    }

    const agents = [...task.agents]
    agents[index] = nextAgent

    return {
      ...task,
      ...countAgents(agents),
      agents,
    }
  })
}

function markWorkflowNotified(
  taskId: string,
  setAppState: SetAppState,
): boolean {
  let shouldEnqueue = false
  updateWorkflowTask(taskId, setAppState, task => {
    if (task.notified) {
      return task
    }
    shouldEnqueue = true
    return {
      ...task,
      notified: true,
    }
  })
  return shouldEnqueue
}

function buildWorkflowSummary(task: LocalWorkflowTaskState): string {
  const completed = task.completedCount
  const failed = task.failedCount
  const killed = task.killedCount
  const parts = [`${completed}/${task.agentCount} completed`]

  if (failed > 0) {
    parts.push(`${failed} failed`)
  }
  if (killed > 0) {
    parts.push(`${killed} stopped`)
  }

  return parts.join(' · ')
}

function buildWorkflowResultDetails(task: LocalWorkflowTaskState): string {
  const lines: string[] = []

  if (task.error) {
    lines.push(`Error: ${task.error}`)
  }

  for (const agent of task.agents) {
    const label = `${agent.name} (${agent.agentType})`
    if (agent.status === 'completed' && agent.summary) {
      lines.push(`- ${label}: ${agent.summary}`)
      continue
    }
    if (agent.status === 'failed' && agent.error) {
      lines.push(`- ${label}: failed - ${agent.error}`)
      continue
    }
    if (agent.status === 'killed') {
      lines.push(`- ${label}: stopped`)
      continue
    }
    lines.push(`- ${label}: ${agent.status}`)
  }

  return lines.join('\n')
}

function enqueueWorkflowNotification(
  taskId: string,
  setAppState: SetAppState,
  status: 'completed' | 'failed' | 'killed',
): void {
  let snapshot: LocalWorkflowTaskState | undefined
  updateWorkflowTask(taskId, setAppState, task => {
    snapshot = task
    return task
  })

  const task = snapshot
  if (!task || !markWorkflowNotified(taskId, setAppState)) {
    return
  }

  const toolUseIdLine = task.toolUseId
    ? `\n<${TOOL_USE_ID_TAG}>${task.toolUseId}</${TOOL_USE_ID_TAG}>`
    : ''

  const statusText =
    status === 'completed'
      ? 'completed'
      : status === 'failed'
        ? 'failed'
        : 'was stopped'

  const message = `<${TASK_NOTIFICATION_TAG}>
<${TASK_ID_TAG}>${taskId}</${TASK_ID_TAG}>${toolUseIdLine}
<${TASK_TYPE_TAG}>local_workflow</${TASK_TYPE_TAG}>
<${OUTPUT_FILE_TAG}>${getTaskOutputPath(taskId)}</${OUTPUT_FILE_TAG}>
<${STATUS_TAG}>${status}</${STATUS_TAG}>
<${SUMMARY_TAG}>Workflow "${task.workflowName}" ${statusText} · ${buildWorkflowSummary(task)}</${SUMMARY_TAG}>
</${TASK_NOTIFICATION_TAG}>${buildWorkflowResultDetails(task) ? `\n${buildWorkflowResultDetails(task)}` : ''}`

  enqueuePendingNotification({
    value: message,
    mode: 'task-notification',
  })
}

export function registerWorkflowTask(
  setAppState: SetAppState,
  opts: {
    workflowName: string
    objective: string
    executionMode: WorkflowExecutionMode
    agents: WorkflowAgentDescriptor[]
    abortController: AbortController
    toolUseId?: string
  },
): LocalWorkflowTaskState {
  const id = generateTaskId('local_workflow')
  const agents = buildInitialAgents(opts.agents)
  const task: LocalWorkflowTaskState = {
    ...createTaskStateBase(id, 'local_workflow', opts.objective, opts.toolUseId),
    type: 'local_workflow',
    status: 'running',
    workflowName: opts.workflowName,
    summary: opts.objective,
    objective: opts.objective,
    executionMode: opts.executionMode,
    agentCount: agents.length,
    completedCount: 0,
    failedCount: 0,
    killedCount: 0,
    agents,
    abortController: opts.abortController,
    agentControllers: {},
  }

  registerTask(task, setAppState)
  return task
}

export function setWorkflowAgentController(
  taskId: string,
  agentId: string,
  controller: AbortController | undefined,
  setAppState: SetAppState,
): void {
  updateWorkflowTask(taskId, setAppState, task => {
    const currentControllers = task.agentControllers ?? {}
    const nextControllers = { ...currentControllers }

    if (controller) {
      nextControllers[agentId] = controller
    } else {
      delete nextControllers[agentId]
    }

    return {
      ...task,
      agentControllers: nextControllers,
    }
  })
}

export function startWorkflowAgent(
  taskId: string,
  agentId: string,
  setAppState: SetAppState,
): void {
  updateWorkflowAgent(taskId, agentId, setAppState, agent => ({
    ...agent,
    status: 'running',
    startTime: Date.now(),
    endTime: undefined,
    error: undefined,
  }))
}

export function updateWorkflowAgentProgress(
  taskId: string,
  agentId: string,
  setAppState: SetAppState,
  progress: {
    tokenCount: number
    toolUseCount: number
    summary?: string
  },
): void {
  updateWorkflowAgent(taskId, agentId, setAppState, agent => ({
    ...agent,
    tokenCount: progress.tokenCount,
    toolUseCount: progress.toolUseCount,
    summary: progress.summary ?? agent.summary,
  }))
}

export function completeWorkflowAgent(
  taskId: string,
  agentId: string,
  setAppState: SetAppState,
  result: {
    summary?: string
    tokenCount: number
    toolUseCount: number
  },
): void {
  updateWorkflowAgent(taskId, agentId, setAppState, agent => ({
    ...agent,
    status: 'completed',
    endTime: Date.now(),
    tokenCount: result.tokenCount,
    toolUseCount: result.toolUseCount,
    summary: result.summary ?? agent.summary,
    error: undefined,
  }))
  setWorkflowAgentController(taskId, agentId, undefined, setAppState)
}

export function failWorkflowAgent(
  taskId: string,
  agentId: string,
  setAppState: SetAppState,
  result: {
    error: string
    summary?: string
    tokenCount: number
    toolUseCount: number
  },
): void {
  updateWorkflowAgent(taskId, agentId, setAppState, agent => ({
    ...agent,
    status: 'failed',
    endTime: Date.now(),
    tokenCount: result.tokenCount,
    toolUseCount: result.toolUseCount,
    summary: result.summary ?? agent.summary,
    error: result.error,
  }))
  setWorkflowAgentController(taskId, agentId, undefined, setAppState)
}

export function stopWorkflowAgent(
  taskId: string,
  agentId: string,
  setAppState: SetAppState,
  summary?: string,
): void {
  updateWorkflowAgent(taskId, agentId, setAppState, agent => ({
    ...agent,
    status: agent.status === 'completed' ? agent.status : 'killed',
    endTime: agent.endTime ?? Date.now(),
    summary: summary ?? agent.summary,
  }))
  setWorkflowAgentController(taskId, agentId, undefined, setAppState)
}

export function finalizeWorkflowTask(
  taskId: string,
  setAppState: SetAppState,
  result: {
    status: 'completed' | 'failed'
    error?: string
  },
): void {
  updateWorkflowTask(taskId, setAppState, task => {
    if (task.status !== 'running') {
      return task
    }

    const agents = task.agents.map(agent => {
      if (agent.status !== 'pending') {
        return agent
      }
      return {
        ...agent,
        status: result.status === 'completed' ? agent.status : 'killed',
        endTime: Date.now(),
        error:
          result.status === 'failed'
            ? 'Workflow stopped before this agent could run.'
            : agent.error,
      }
    })

    return {
      ...task,
      ...countAgents(agents),
      status: result.status,
      endTime: Date.now(),
      error: result.error,
      agents,
      abortController: undefined,
      agentControllers: {},
    }
  })

  enqueueWorkflowNotification(taskId, setAppState, result.status)
  void evictTaskOutput(taskId)
}

export async function killWorkflowTask(
  taskId: string,
  setAppState: SetAppState,
): Promise<void> {
  let shouldNotify = false

  updateWorkflowTask(taskId, setAppState, task => {
    if (task.status !== 'running') {
      return task
    }

    shouldNotify = true
    task.abortController?.abort()
    for (const controller of Object.values(task.agentControllers ?? {})) {
      controller.abort()
    }

    const agents = task.agents.map(agent =>
      agent.status === 'completed' || agent.status === 'failed'
        ? agent
        : {
            ...agent,
            status: 'killed',
            endTime: agent.endTime ?? Date.now(),
          },
    )

    return {
      ...task,
      ...countAgents(agents),
      status: 'killed',
      endTime: Date.now(),
      agents,
      abortController: undefined,
      agentControllers: {},
    }
  })

  if (shouldNotify) {
    enqueueWorkflowNotification(taskId, setAppState, 'killed')
    void evictTaskOutput(taskId)
  }
}

export async function skipWorkflowAgent(
  taskId: string,
  agentId: string,
  setAppState: SetAppState,
): Promise<void> {
  let controller: AbortController | undefined
  updateWorkflowTask(taskId, setAppState, task => {
    controller = task.agentControllers?.[agentId]
    return task
  })
  controller?.abort()
  stopWorkflowAgent(taskId, agentId, setAppState, 'Skipped')
}

export async function retryWorkflowAgent(
  _taskId: string,
  _agentId: string,
  _setAppState: SetAppState,
): Promise<void> {}

export const LocalWorkflowTask: Task = {
  name: 'Workflow',
  type: 'local_workflow',
  async kill(taskId, setAppState) {
    await killWorkflowTask(taskId, setAppState)
  },
}
