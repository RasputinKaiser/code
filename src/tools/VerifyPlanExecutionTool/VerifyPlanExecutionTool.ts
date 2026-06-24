import { z } from 'zod/v4'
import { getSdkAgentProgressSummariesEnabled } from '../../bootstrap/state.js'
import { isCoordinatorMode } from '../../coordinator/coordinatorMode.js'
import type { AppState } from '../../state/AppStateStore.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import {
  isLocalAgentTask,
  registerAsyncAgent,
} from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import { assembleToolPool } from '../../tools.js'
import { asAgentId } from '../../types/ids.js'
import { runWithAgentContext } from '../../utils/agentContext.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { createUserMessage, extractTextContent } from '../../utils/messages.js'
import { getAgentModel } from '../../utils/model/agent.js'
import { getPlanFilePath } from '../../utils/plans.js'
import { getTranscriptPath } from '../../utils/sessionStorage.js'
import { getTaskOutputPath } from '../../utils/task/diskOutput.js'
import { getParentSessionId } from '../../utils/teammate.js'
import { createAgentId } from '../../utils/uuid.js'
import { runAsyncAgentLifecycle } from '../AgentTool/agentToolUtils.js'
import { isForkSubagentEnabled } from '../AgentTool/forkSubagent.js'
import { isBuiltInAgent } from '../AgentTool/loadAgentsDir.js'
import { runAgent } from '../AgentTool/runAgent.js'
import { VERIFICATION_AGENT } from '../AgentTool/built-in/verificationAgent.js'
import { VERIFY_PLAN_EXECUTION_TOOL_NAME } from './constants.js'

const DESCRIPTION =
  'Trigger background verification of the approved plan using the verification agent.'

const PROMPT = `Use this tool after implementation is complete to launch background plan verification.

This tool takes no input.
It reads the pending approved plan from session state and starts a background verifier.
The verifier must produce a final verdict (PASS / FAIL / PARTIAL).`

const inputSchema = z.strictObject({})
type InputSchema = typeof inputSchema

const outputSchema = z.object({
  status: z.enum([
    'async_launched',
    'disabled',
    'no_pending_plan',
    'already_started',
    'already_completed',
  ]),
  message: z.string(),
  taskId: z.string().optional(),
  outputFile: z.string().optional(),
  description: z.string().optional(),
})
type OutputSchema = typeof outputSchema
type Output = z.infer<OutputSchema>

type VerificationVerdict = 'PASS' | 'FAIL' | 'PARTIAL'
type SetAppState = (f: (prev: AppState) => AppState) => void

function getVerificationAppState(appState: AppState): AppState {
  return {
    ...appState,
    toolPermissionContext: {
      ...appState.toolPermissionContext,
      // The verifier is read-only by contract. Force it out of acceptEdits/auto
      // so project writes are not silently allowed in background execution.
      mode: 'default',
      alwaysAllowRules: {},
      shouldAvoidPermissionPrompts: true,
      awaitAutomatedChecksBeforeDialog: false,
      isBypassPermissionsModeAvailable: false,
    },
  }
}

function getVerdict(text: string): VerificationVerdict | null {
  const matches = [...text.matchAll(/\bVERDICT:\s*(PASS|FAIL|PARTIAL)\b/gi)]
  if (matches.length === 0) {
    return null
  }
  const lastMatch = matches[matches.length - 1]?.[1]
  if (!lastMatch) {
    return null
  }
  return lastMatch.toUpperCase() as VerificationVerdict
}

function updatePendingVerificationState(
  setAppState: SetAppState,
  plan: string,
  updates: { verificationStarted: boolean; verificationCompleted: boolean },
): void {
  setAppState(prev => {
    const pending = prev.pendingPlanVerification
    if (!pending || pending.plan !== plan) {
      return prev
    }
    return {
      ...prev,
      pendingPlanVerification: {
        ...pending,
        verificationStarted: updates.verificationStarted,
        verificationCompleted: updates.verificationCompleted,
      },
    }
  })
}

function syncPendingVerificationFromTaskResult(
  taskId: string,
  plan: string,
  getAppState: () => AppState,
  setAppState: SetAppState,
): void {
  const task = getAppState().tasks?.[taskId]
  if (!isLocalAgentTask(task)) {
    updatePendingVerificationState(setAppState, plan, {
      verificationStarted: false,
      verificationCompleted: false,
    })
    return
  }

  if (task.status !== 'completed') {
    updatePendingVerificationState(setAppState, plan, {
      verificationStarted: false,
      verificationCompleted: false,
    })
    return
  }

  const resultText = task.result
    ? extractTextContent(task.result.content, '\n')
    : ''
  const verdict = getVerdict(resultText)

  if (!verdict) {
    updatePendingVerificationState(setAppState, plan, {
      verificationStarted: false,
      verificationCompleted: false,
    })
    return
  }

  updatePendingVerificationState(setAppState, plan, {
    verificationStarted: true,
    verificationCompleted: true,
  })
}

function buildVerifierPrompt(plan: string, planFilePath: string): string {
  const transcriptPath = getTranscriptPath()
  return `Verify whether implementation completed every approved plan item.

Primary evidence:
- Approved plan file: ${planFilePath}
- Conversation transcript: ${transcriptPath}

Approved plan:
${plan}

Requirements:
1. Verify each plan item against concrete local evidence (code, tests, runtime behavior).
2. Run build/tests/linters and any focused probes needed for confidence.
3. End with a single verdict line exactly as:
VERDICT: PASS
or
VERDICT: FAIL
or
VERDICT: PARTIAL`
}

export const VerifyPlanExecutionTool = buildTool({
  name: VERIFY_PLAN_EXECUTION_TOOL_NAME,
  searchHint: 'trigger background verification for completed plan execution',
  maxResultSizeChars: 100_000,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  get inputSchema(): InputSchema {
    return inputSchema
  },
  get outputSchema(): OutputSchema {
    return outputSchema
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return false
  },
  renderToolUseMessage() {
    return null
  },
  async call(_input, toolUseContext, canUseTool, parentMessage) {
    if (toolUseContext.agentId) {
      return {
        data: {
          status: 'disabled',
          message:
            'VerifyPlanExecution must be called from the main thread, not from an agent.',
        },
      }
    }

    if (!isEnvTruthy(process.env.CLAUDE_CODE_VERIFY_PLAN)) {
      return {
        data: {
          status: 'disabled',
          message: 'Plan verification is not enabled.',
        },
      }
    }

    const appState = toolUseContext.getAppState()
    const pending = appState.pendingPlanVerification
    if (!pending) {
      return {
        data: {
          status: 'no_pending_plan',
          message:
            'No pending plan verification was found. Continue implementation or exit plan mode first.',
        },
      }
    }

    if (pending.verificationCompleted) {
      return {
        data: {
          status: 'already_completed',
          message: 'Plan verification has already completed for this plan.',
        },
      }
    }

    if (pending.verificationStarted) {
      return {
        data: {
          status: 'already_started',
          message: 'Plan verification is already running in the background.',
        },
      }
    }

    const rootSetAppState =
      toolUseContext.setAppStateForTasks ?? toolUseContext.setAppState
    const plan = pending.plan
    updatePendingVerificationState(rootSetAppState, plan, {
      verificationStarted: true,
      verificationCompleted: false,
    })

    const selectedAgent = VERIFICATION_AGENT
    const description = 'Verify approved plan execution'
    const verifierPrompt = buildVerifierPrompt(
      plan,
      getPlanFilePath(toolUseContext.agentId),
    )
    const agentId = createAgentId()

    try {
      const verificationGetAppState = () =>
        getVerificationAppState(toolUseContext.getAppState())
      const verificationAppState = verificationGetAppState()
      const verificationToolUseContext = {
        ...toolUseContext,
        getAppState: verificationGetAppState,
      }
      const workerPermissionContext = verificationAppState.toolPermissionContext
      const workerTools = assembleToolPool(
        workerPermissionContext,
        verificationAppState.mcp.tools,
      )

      const task = registerAsyncAgent({
        agentId,
        description,
        prompt: verifierPrompt,
        selectedAgent,
        setAppState: rootSetAppState,
        toolUseId: toolUseContext.toolUseId,
      })

      const metadata = {
        prompt: verifierPrompt,
        resolvedAgentModel: getAgentModel(
          selectedAgent.model,
          toolUseContext.options.mainLoopModel,
          undefined,
          verificationAppState.toolPermissionContext.mode,
        ),
        isBuiltInAgent: isBuiltInAgent(selectedAgent),
        startTime: Date.now(),
        agentType: selectedAgent.agentType,
        isAsync: true,
      }

      const runAgentParams: Parameters<typeof runAgent>[0] = {
        agentDefinition: selectedAgent,
        promptMessages: [createUserMessage({ content: verifierPrompt })],
        toolUseContext: verificationToolUseContext,
        canUseTool,
        isAsync: true,
        querySource: 'verification_agent',
        availableTools: workerTools,
        description,
      }

      const asyncAgentContext = {
        agentId,
        parentSessionId: getParentSessionId(),
        agentType: 'subagent' as const,
        subagentName: selectedAgent.agentType,
        isBuiltIn: isBuiltInAgent(selectedAgent),
        invokingRequestId: parentMessage.requestId,
        invocationKind: 'spawn' as const,
        invocationEmitted: false,
      }

      void runWithAgentContext(asyncAgentContext, async () => {
        try {
          await runAsyncAgentLifecycle({
            taskId: task.agentId,
            abortController: task.abortController!,
            makeStream: onCacheSafeParams =>
              runAgent({
                ...runAgentParams,
                override: {
                  agentId: asAgentId(task.agentId),
                  abortController: task.abortController!,
                },
                onCacheSafeParams,
              }),
            metadata,
            description,
            toolUseContext: verificationToolUseContext,
            rootSetAppState,
            agentIdForCleanup: agentId,
            enableSummarization:
              isCoordinatorMode() ||
              isForkSubagentEnabled() ||
              getSdkAgentProgressSummariesEnabled(),
            getWorktreeResult: async () => ({}),
          })
        } finally {
          syncPendingVerificationFromTaskResult(
            task.agentId,
            plan,
            toolUseContext.getAppState,
            rootSetAppState,
          )
        }
      })

      return {
        data: {
          status: 'async_launched',
          message:
            'Background verification started. You will be notified when it finishes.',
          taskId: task.agentId,
          outputFile: getTaskOutputPath(task.agentId),
          description,
        },
      }
    } catch (error) {
      updatePendingVerificationState(rootSetAppState, plan, {
        verificationStarted: false,
        verificationCompleted: false,
      })
      throw error
    }
  },
  mapToolResultToToolResultBlockParam(result, toolUseID) {
    const data = result as Output
    if (data.status === 'async_launched') {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: [
          {
            type: 'text',
            text: `Plan verification launched in the background.
taskId: ${data.taskId}
output_file: ${data.outputFile}
Wait for the task notification before reporting completion.`,
          },
        ],
      }
    }

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: data.message,
    }
  },
} satisfies ToolDef<InputSchema, Output>)
