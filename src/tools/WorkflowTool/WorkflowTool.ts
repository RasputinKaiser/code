import * as React from 'react'
import { z } from 'zod/v4'
import type { AppState } from '../../state/AppStateStore.js'
import { buildTool, type ToolDef, type ToolUseContext } from '../../Tool.js'
import { Text } from '../../ink.js'
import { assembleToolPool } from '../../tools.js'
import {
  createActivityDescriptionResolver,
  createProgressTracker,
  getProgressUpdate,
  updateProgressFromMessage,
} from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import {
  completeWorkflowAgent,
  failWorkflowAgent,
  finalizeWorkflowTask,
  registerWorkflowTask,
  setWorkflowAgentController,
  startWorkflowAgent,
  stopWorkflowAgent,
  updateWorkflowAgentProgress,
  type WorkflowAgentDescriptor,
  type WorkflowExecutionMode,
} from '../../tasks/LocalWorkflowTask/LocalWorkflowTask.js'
import { asAgentId } from '../../types/ids.js'
import { createChildAbortController } from '../../utils/abortController.js'
import { runWithAgentContext } from '../../utils/agentContext.js'
import { AbortError, errorMessage } from '../../utils/errors.js'
import { createUserMessage, extractTextContent } from '../../utils/messages.js'
import { getAgentModel } from '../../utils/model/agent.js'
import { MODEL_ALIASES, type ModelAlias } from '../../utils/model/aliases.js'
import { getQuerySourceForAgent } from '../../utils/promptCategory.js'
import { getParentSessionId } from '../../utils/teammate.js'
import { appendTaskOutput, getTaskOutputPath } from '../../utils/task/diskOutput.js'
import { createAgentId } from '../../utils/uuid.js'
import {
  extractPartialResult,
  finalizeAgentTool,
} from '../AgentTool/agentToolUtils.js'
import { isBuiltInAgent, type AgentDefinition } from '../AgentTool/loadAgentsDir.js'
import { runAgent } from '../AgentTool/runAgent.js'
import { WORKFLOW_TOOL_NAME } from './constants.js'

const DESCRIPTION =
  'Launch a background workflow composed of one or more agent runs and track it as a single workflow task.'

const PROMPT = `Use this tool to launch a real background workflow when the work is better modeled as named agent runs under one tracked workflow.

Provide:
- workflow_name: short stable identifier for the workflow
- objective: the overall goal
- execution: use sequential when later agents depend on earlier outputs; use parallel only when the agents can safely run independently
- agents: one or more explicit agent runs with self-contained prompts

Each agent run becomes part of one workflow task in the background task UI.`

const workflowAgentSchema = z.strictObject({
  name: z.string().min(1).describe('Short label for this workflow agent run'),
  prompt: z.string().min(1).describe('Exact prompt for this workflow agent'),
  description: z
    .string()
    .min(1)
    .optional()
    .describe('Optional human-readable description shown in the task UI'),
  agent_type: z
    .string()
    .min(1)
    .optional()
    .describe('Agent type to use. Defaults to general-purpose when omitted.'),
  model: z
    .enum(MODEL_ALIASES)
    .optional()
    .describe('Optional model override for this workflow agent'),
  max_turns: z
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .describe('Optional max-turn limit for this workflow agent'),
})

type WorkflowAgentInput = z.infer<typeof workflowAgentSchema>

const inputSchema = () =>
  z.strictObject({
    workflow_name: z
      .string()
      .min(1)
      .describe('Short stable workflow name used in the task UI'),
    objective: z
      .string()
      .min(1)
      .describe('Overall goal of the workflow'),
    execution: z
      .enum(['sequential', 'parallel'])
      .default('sequential')
      .describe('Whether the workflow agents should run sequentially or in parallel'),
    agents: z
      .array(workflowAgentSchema)
      .min(1)
      .max(8)
      .describe('One or more agent runs to execute as part of the workflow'),
  })
type InputSchema = ReturnType<typeof inputSchema>

type Input = z.infer<InputSchema>

const outputSchema = () =>
  z.object({
    status: z.enum(['async_launched', 'disabled']),
    message: z.string(),
    taskId: z.string().optional(),
    workflowName: z.string().optional(),
    outputFile: z.string().optional(),
    agentCount: z.number().int().positive().optional(),
    execution: z.enum(['sequential', 'parallel']).optional(),
  })
type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

type ResolvedWorkflowAgent = WorkflowAgentDescriptor & {
  selectedAgent: AgentDefinition
  model?: ModelAlias
  maxTurns?: number
}

type WorkflowRuntimeParams = {
  taskId: string
  workflowName: string
  objective: string
  executionMode: WorkflowExecutionMode
  agents: ResolvedWorkflowAgent[]
  workflowAbortController: AbortController
  toolUseContext: ToolUseContext
  canUseTool: Parameters<ToolDef<InputSchema, Output>['call']>[2]
  parentMessage: Parameters<ToolDef<InputSchema, Output>['call']>[3]
  rootSetAppState: (f: (prev: AppState) => AppState) => void
}

type WorkflowRuntime = (params: WorkflowRuntimeParams) => Promise<void>

let workflowRuntime: WorkflowRuntime = runWorkflowLifecycle

export function __setWorkflowRuntimeForTests(runtime?: WorkflowRuntime): void {
  workflowRuntime = runtime ?? runWorkflowLifecycle
}

function getWorkflowAppState(appState: AppState): AppState {
  return {
    ...appState,
    toolPermissionContext: {
      ...appState.toolPermissionContext,
      shouldAvoidPermissionPrompts: true,
      awaitAutomatedChecksBeforeDialog: false,
      isBypassPermissionsModeAvailable: false,
    },
  }
}

function appendWorkflowLog(taskId: string, line: string): void {
  appendTaskOutput(taskId, `[${new Date().toISOString()}] ${line}\n`)
}

function summarizeText(text: string | undefined): string | undefined {
  if (!text) {
    return undefined
  }
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return undefined
  }
  return normalized.length > 280
    ? `${normalized.slice(0, 277).trimEnd()}...`
    : normalized
}

function resolveWorkflowAgents(
  inputAgents: WorkflowAgentInput[],
  context: ToolUseContext,
): ResolvedWorkflowAgent[] {
  const activeAgents = context.options.agentDefinitions.activeAgents
  const defaultAgent =
    activeAgents.find(agent => agent.agentType === 'general-purpose') ??
    activeAgents[0]

  if (!defaultAgent) {
    throw new Error('No agents are available for workflow execution.')
  }

  return inputAgents.map(agentInput => {
    const selectedAgent = agentInput.agent_type
      ? activeAgents.find(agent => agent.agentType === agentInput.agent_type)
      : defaultAgent

    if (!selectedAgent) {
      throw new Error(
        `Workflow agent type not found: ${agentInput.agent_type}`,
      )
    }

    return {
      id: createAgentId(),
      name: agentInput.name,
      description: agentInput.description ?? agentInput.name,
      prompt: agentInput.prompt,
      agentType: selectedAgent.agentType,
      model: agentInput.model,
      maxTurns: agentInput.max_turns,
      selectedAgent,
    }
  })
}

async function runWorkflowAgentTask({
  taskId,
  executionMode,
  agent,
  workflowAbortController,
  toolUseContext,
  canUseTool,
  parentMessage,
  rootSetAppState,
}: {
  taskId: string
  executionMode: WorkflowExecutionMode
  agent: ResolvedWorkflowAgent
  workflowAbortController: AbortController
  toolUseContext: ToolUseContext
  canUseTool: Parameters<ToolDef<InputSchema, Output>['call']>[2]
  parentMessage: Parameters<ToolDef<InputSchema, Output>['call']>[3]
  rootSetAppState: (f: (prev: AppState) => AppState) => void
}): Promise<'completed' | 'failed' | 'killed'> {
  if (workflowAbortController.signal.aborted) {
    stopWorkflowAgent(taskId, agent.id, rootSetAppState, 'Workflow stopped')
    return 'killed'
  }

  const agentAbortController = createChildAbortController(
    workflowAbortController,
  )
  setWorkflowAgentController(taskId, agent.id, agentAbortController, rootSetAppState)
  startWorkflowAgent(taskId, agent.id, rootSetAppState)
  appendWorkflowLog(
    taskId,
    `Started ${agent.name} (${agent.agentType}) in ${executionMode} mode.`,
  )

  const workflowGetAppState = () =>
    getWorkflowAppState(toolUseContext.getAppState())
  const workflowToolUseContext = {
    ...toolUseContext,
    getAppState: workflowGetAppState,
  }
  const workflowAppState = workflowGetAppState()
  const workerPermissionContext = {
    ...workflowAppState.toolPermissionContext,
    mode:
      agent.selectedAgent.permissionMode ??
      workflowAppState.toolPermissionContext.mode,
  }
  const workerTools = assembleToolPool(
    workerPermissionContext,
    workflowAppState.mcp.tools,
  )
  const tracker = createProgressTracker()
  const resolveActivity = createActivityDescriptionResolver(workerTools)
  const agentMessages: Parameters<typeof finalizeAgentTool>[0] = []
  const resolvedModel = getAgentModel(
    agent.selectedAgent.model,
    toolUseContext.options.mainLoopModel,
    agent.model,
    workerPermissionContext.mode,
  )
  const metadata = {
    prompt: agent.prompt,
    resolvedAgentModel: resolvedModel,
    isBuiltInAgent: isBuiltInAgent(agent.selectedAgent),
    startTime: Date.now(),
    agentType: agent.selectedAgent.agentType,
    isAsync: true,
  }

  try {
    const agentContext = {
      agentId: agent.id,
      parentSessionId: getParentSessionId(),
      agentType: 'subagent' as const,
      subagentName: agent.selectedAgent.agentType,
      isBuiltIn: isBuiltInAgent(agent.selectedAgent),
      invokingRequestId: parentMessage.requestId,
      invocationKind: 'spawn' as const,
      invocationEmitted: false,
    }

    await runWithAgentContext(agentContext, async () => {
      for await (const message of runAgent({
        agentDefinition: agent.selectedAgent,
        promptMessages: [createUserMessage({ content: agent.prompt })],
        toolUseContext: workflowToolUseContext,
        canUseTool,
        isAsync: true,
        querySource: getQuerySourceForAgent(
          agent.selectedAgent.agentType,
          isBuiltInAgent(agent.selectedAgent),
        ),
        override: {
          agentId: asAgentId(agent.id),
          abortController: agentAbortController,
        },
        model: agent.model,
        maxTurns: agent.maxTurns,
        availableTools: workerTools,
        description: agent.description,
        transcriptSubdir: `workflows/${taskId}`,
      })) {
        agentMessages.push(message)
        updateProgressFromMessage(
          tracker,
          message,
          resolveActivity,
          workerTools,
        )
        const progress = getProgressUpdate(tracker)
        updateWorkflowAgentProgress(taskId, agent.id, rootSetAppState, {
          tokenCount: progress.tokenCount,
          toolUseCount: progress.toolUseCount,
          summary: progress.lastActivity?.activityDescription,
        })
      }
    })

    const result = finalizeAgentTool(agentMessages, agent.id, metadata)
    const summary = summarizeText(
      extractTextContent(result.content, '\n') || extractPartialResult(agentMessages),
    )
    completeWorkflowAgent(taskId, agent.id, rootSetAppState, {
      summary,
      tokenCount: result.totalTokens,
      toolUseCount: result.totalToolUseCount,
    })
    appendWorkflowLog(
      taskId,
      `Completed ${agent.name} (${agent.agentType})${summary ? `: ${summary}` : '.'}`,
    )
    return 'completed'
  } catch (error) {
    const partial = summarizeText(extractPartialResult(agentMessages))

    if (error instanceof AbortError || workflowAbortController.signal.aborted) {
      stopWorkflowAgent(taskId, agent.id, rootSetAppState, partial)
      appendWorkflowLog(
        taskId,
        `Stopped ${agent.name} (${agent.agentType})${partial ? `: ${partial}` : '.'}`,
      )
      return 'killed'
    }

    const message = errorMessage(error)
    failWorkflowAgent(taskId, agent.id, rootSetAppState, {
      error: message,
      summary: partial,
      tokenCount: getProgressUpdate(tracker).tokenCount,
      toolUseCount: getProgressUpdate(tracker).toolUseCount,
    })
    appendWorkflowLog(
      taskId,
      `Failed ${agent.name} (${agent.agentType}): ${message}`,
    )
    return 'failed'
  }
}

async function runWorkflowLifecycle({
  taskId,
  workflowName,
  objective,
  executionMode,
  agents,
  workflowAbortController,
  toolUseContext,
  canUseTool,
  parentMessage,
  rootSetAppState,
}: WorkflowRuntimeParams): Promise<void> {
  appendWorkflowLog(
    taskId,
    `Workflow ${workflowName} started with ${agents.length} agent${agents.length === 1 ? '' : 's'} (${executionMode}).`,
  )
  appendWorkflowLog(taskId, `Objective: ${objective}`)

  try {
    const results: Array<'completed' | 'failed' | 'killed'> = []

    if (executionMode === 'parallel') {
      results.push(
        ...(await Promise.all(
          agents.map(agent =>
            runWorkflowAgentTask({
              taskId,
              executionMode,
              agent,
              workflowAbortController,
              toolUseContext,
              canUseTool,
              parentMessage,
              rootSetAppState,
            }),
          ),
        )),
      )
    } else {
      for (const agent of agents) {
        if (workflowAbortController.signal.aborted) {
          results.push('killed')
          break
        }

        const result = await runWorkflowAgentTask({
          taskId,
          executionMode,
          agent,
          workflowAbortController,
          toolUseContext,
          canUseTool,
          parentMessage,
          rootSetAppState,
        })
        results.push(result)

        if (result === 'failed') {
          break
        }
      }
    }

    if (workflowAbortController.signal.aborted) {
      return
    }

    if (results.some(result => result === 'failed')) {
      finalizeWorkflowTask(taskId, rootSetAppState, {
        status: 'failed',
        error: 'One or more workflow agents failed.',
      })
      appendWorkflowLog(taskId, `Workflow ${workflowName} failed.`)
      return
    }

    if (results.some(result => result === 'killed')) {
      finalizeWorkflowTask(taskId, rootSetAppState, {
        status: 'failed',
        error: 'Workflow stopped before all agents completed.',
      })
      appendWorkflowLog(taskId, `Workflow ${workflowName} stopped early.`)
      return
    }

    finalizeWorkflowTask(taskId, rootSetAppState, {
      status: 'completed',
    })
    appendWorkflowLog(taskId, `Workflow ${workflowName} completed.`)
  } catch (error) {
    if (workflowAbortController.signal.aborted) {
      return
    }

    const message = errorMessage(error)
    appendWorkflowLog(taskId, `Workflow ${workflowName} failed: ${message}`)
    finalizeWorkflowTask(taskId, rootSetAppState, {
      status: 'failed',
      error: message,
    })
  }
}

export const WorkflowTool = buildTool({
  name: WORKFLOW_TOOL_NAME,
  maxResultSizeChars: 100_000,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  isConcurrencySafe() {
    return true
  },
  renderToolUseMessage() {
    return null
  },
  async call(input, toolUseContext, canUseTool, parentMessage) {
    if (toolUseContext.agentId) {
      return {
        data: {
          status: 'disabled' as const,
          message:
            'Workflow must be called from the main thread, not from a subagent.',
        },
      }
    }

    const agents = resolveWorkflowAgents(input.agents, toolUseContext)
    const workflowAbortController = new AbortController()
    const rootSetAppState =
      toolUseContext.setAppStateForTasks ?? toolUseContext.setAppState
    const task = registerWorkflowTask(rootSetAppState, {
      workflowName: input.workflow_name,
      objective: input.objective,
      executionMode: input.execution,
      agents,
      abortController: workflowAbortController,
      toolUseId: toolUseContext.toolUseId,
    })

    void workflowRuntime({
      taskId: task.id,
      workflowName: input.workflow_name,
      objective: input.objective,
      executionMode: input.execution,
      agents,
      workflowAbortController,
      toolUseContext,
      canUseTool,
      parentMessage,
      rootSetAppState,
    }).catch(error => {
      appendWorkflowLog(task.id, `Workflow ${input.workflow_name} failed: ${errorMessage(error)}`)
      finalizeWorkflowTask(task.id, rootSetAppState, {
        status: 'failed',
        error: errorMessage(error),
      })
    })

    return {
      data: {
        status: 'async_launched' as const,
        message: `Workflow "${input.workflow_name}" launched in the background with ${agents.length} agent${agents.length === 1 ? '' : 's'} (${input.execution}).`,
        taskId: task.id,
        workflowName: input.workflow_name,
        outputFile: getTaskOutputPath(task.id),
        agentCount: agents.length,
        execution: input.execution,
      },
    }
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const result = content as Output
    if (result.status === 'async_launched') {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: `Workflow ${result.workflowName} launched in the background.
taskId: ${result.taskId}
output_file: ${result.outputFile}
agent_count: ${result.agentCount}
execution: ${result.execution}
Wait for the workflow task notification before reporting completion.`,
      }
    }

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: result.message,
    }
  },
  renderToolResultMessage(output: Output) {
    return React.createElement(Text, {}, output.message)
  },
} satisfies ToolDef<InputSchema, Output>)
