import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { getDefaultAppState } from '../../state/AppStateStore.js'

const bootstrapStatePaths = [
  import.meta.resolve('../../bootstrap/state.ts'),
  import.meta.resolve('../../bootstrap/state.js'),
]
const coordinatorModePaths = [
  import.meta.resolve('../../coordinator/coordinatorMode.ts'),
  import.meta.resolve('../../coordinator/coordinatorMode.js'),
]
const localAgentTaskPaths = [
  import.meta.resolve('../../tasks/LocalAgentTask/LocalAgentTask.tsx'),
  import.meta.resolve('../../tasks/LocalAgentTask/LocalAgentTask.js'),
]
const toolsPaths = [
  import.meta.resolve('../../tools.ts'),
  import.meta.resolve('../../tools.js'),
]
const agentContextPaths = [
  import.meta.resolve('../../utils/agentContext.ts'),
  import.meta.resolve('../../utils/agentContext.js'),
]
const modelAgentPaths = [
  import.meta.resolve('../../utils/model/agent.ts'),
  import.meta.resolve('../../utils/model/agent.js'),
]
const plansPaths = [
  import.meta.resolve('../../utils/plans.ts'),
  import.meta.resolve('../../utils/plans.js'),
]
const sessionStoragePaths = [
  import.meta.resolve('../../utils/sessionStorage.ts'),
  import.meta.resolve('../../utils/sessionStorage.js'),
]
const diskOutputPaths = [
  import.meta.resolve('../../utils/task/diskOutput.ts'),
  import.meta.resolve('../../utils/task/diskOutput.js'),
]
const teammatePaths = [
  import.meta.resolve('../../utils/teammate.ts'),
  import.meta.resolve('../../utils/teammate.js'),
]
const uuidPaths = [
  import.meta.resolve('../../utils/uuid.ts'),
  import.meta.resolve('../../utils/uuid.js'),
]
const agentToolUtilsPaths = [
  import.meta.resolve('../AgentTool/agentToolUtils.ts'),
  import.meta.resolve('../AgentTool/agentToolUtils.js'),
]
const forkSubagentPaths = [
  import.meta.resolve('../AgentTool/forkSubagent.ts'),
  import.meta.resolve('../AgentTool/forkSubagent.js'),
]
const loadAgentsDirPaths = [
  import.meta.resolve('../AgentTool/loadAgentsDir.ts'),
  import.meta.resolve('../AgentTool/loadAgentsDir.js'),
]
const runAgentPaths = [
  import.meta.resolve('../AgentTool/runAgent.ts'),
  import.meta.resolve('../AgentTool/runAgent.js'),
]
const verificationAgentPaths = [
  import.meta.resolve('../AgentTool/built-in/verificationAgent.ts'),
  import.meta.resolve('../AgentTool/built-in/verificationAgent.js'),
]

const actualBootstrapState = await import(
  import.meta.resolve('../../bootstrap/state.ts')
)
const actualLocalAgentTask = await import(
  import.meta.resolve('../../tasks/LocalAgentTask/LocalAgentTask.tsx')
)
const actualDiskOutput = await import(
  import.meta.resolve('../../utils/task/diskOutput.ts')
)
const actualTeammateModule = await import(
  import.meta.resolve('../../utils/teammate.ts')
)
const actualUuidModule = await import(import.meta.resolve('../../utils/uuid.ts'))
const actualAgentToolUtils = await import(
  import.meta.resolve('../AgentTool/agentToolUtils.ts')
)
const actualForkSubagent = await import(
  import.meta.resolve('../AgentTool/forkSubagent.ts')
)
const actualLoadAgentsDir = await import(
  import.meta.resolve('../AgentTool/loadAgentsDir.ts')
)

const assembleToolPoolCalls: unknown[][] = []
const registerAsyncAgentCalls: Array<Record<string, unknown>> = []
const lifecycleCalls: Array<Record<string, unknown>> = []

let lifecyclePromise: Promise<void>

const originalBuildMode = process.env.NCODE_BUILD_MODE
const originalUserType = process.env.USER_TYPE
const originalVerifyPlan = process.env.CLAUDE_CODE_VERIFY_PLAN

for (const bootstrapStatePath of bootstrapStatePaths) {
  mock.module(bootstrapStatePath, () => ({
    ...actualBootstrapState,
    getSdkAgentProgressSummariesEnabled: () => false,
  }))
}

for (const coordinatorModePath of coordinatorModePaths) {
  mock.module(coordinatorModePath, () => ({
    isCoordinatorMode: () => false,
  }))
}

for (const localAgentTaskPath of localAgentTaskPaths) {
  mock.module(localAgentTaskPath, () => ({
    ...actualLocalAgentTask,
    isLocalAgentTask(task: unknown) {
      return Boolean(
        task &&
          typeof task === 'object' &&
          '__localAgentTask' in task &&
          (task as { __localAgentTask?: boolean }).__localAgentTask,
      )
    },
    registerAsyncAgent(args: Record<string, unknown>) {
      registerAsyncAgentCalls.push(args)
      return {
        agentId: 'verify-task-1',
        abortController: new AbortController(),
        __localAgentTask: true,
        status: 'running',
      }
    },
  }))
}

for (const toolsPath of toolsPaths) {
  mock.module(toolsPath, () => ({
    assembleToolPool: (...args: unknown[]) => {
      assembleToolPoolCalls.push(args)
      return ['Read']
    },
  }))
}

for (const agentContextPath of agentContextPaths) {
  mock.module(agentContextPath, () => ({
    runWithAgentContext: (_context: unknown, fn: () => Promise<unknown>) => fn(),
  }))
}

for (const modelAgentPath of modelAgentPaths) {
  mock.module(modelAgentPath, () => ({
    getAgentModel: () => '/resolved-verifier-model',
  }))
}

for (const plansPath of plansPaths) {
  mock.module(plansPath, () => ({
    getPlanFilePath: () => '/tmp/approved-plan.md',
  }))
}

for (const sessionStoragePath of sessionStoragePaths) {
  mock.module(sessionStoragePath, () => ({
    getTranscriptPath: () => '/tmp/transcript.jsonl',
  }))
}

for (const diskOutputPath of diskOutputPaths) {
  mock.module(diskOutputPath, () => ({
    ...actualDiskOutput,
    getTaskOutputPath: (taskId: string) => `/tmp/${taskId}.out`,
  }))
}

for (const teammatePath of teammatePaths) {
  mock.module(teammatePath, () => ({
    ...actualTeammateModule,
    getParentSessionId: () => 'parent-session-1',
  }))
}

for (const uuidPath of uuidPaths) {
  mock.module(uuidPath, () => ({
    ...actualUuidModule,
    createAgentId: () => 'verification-agent-123',
  }))
}

for (const agentToolUtilsPath of agentToolUtilsPaths) {
  mock.module(agentToolUtilsPath, () => ({
    ...actualAgentToolUtils,
    runAsyncAgentLifecycle: async (args: Record<string, unknown>) => {
      lifecycleCalls.push(args)
      return lifecyclePromise
    },
  }))
}

for (const forkSubagentPath of forkSubagentPaths) {
  mock.module(forkSubagentPath, () => ({
    ...actualForkSubagent,
    isForkSubagentEnabled: () => false,
  }))
}

for (const loadAgentsDirPath of loadAgentsDirPaths) {
  mock.module(loadAgentsDirPath, () => ({
    ...actualLoadAgentsDir,
    isBuiltInAgent: () => true,
  }))
}

for (const runAgentPath of runAgentPaths) {
  mock.module(runAgentPath, () => ({
    runAgent: async () => {
      throw new Error('runAgent should be mediated by the lifecycle helper in this test')
    },
  }))
}

for (const verificationAgentPath of verificationAgentPaths) {
  mock.module(verificationAgentPath, () => ({
    VERIFICATION_AGENT: {
      agentType: 'verification',
      source: 'built-in',
      baseDir: 'built-in',
      model: '/verification-model',
      getSystemPrompt: () => 'verify things',
    },
  }))
}

const { VerifyPlanExecutionTool } = await import(
  import.meta.resolve('./VerifyPlanExecutionTool.ts')
)

function createToolUseContext(
  initialAppState?: Partial<ReturnType<typeof getDefaultAppState>>,
  agentId?: string,
) {
  let appState = {
    ...getDefaultAppState(),
    ...initialAppState,
  }

  const setAppState = (updater: (prev: typeof appState) => typeof appState) => {
    appState = updater(appState)
  }

  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: '/data/models/hf/moonshotai__Kimi-K2.7-Code',
      tools: [VerifyPlanExecutionTool] as never,
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
    toolUseId: 'verify-plan-tool-use',
    agentId,
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

beforeEach(() => {
  assembleToolPoolCalls.length = 0
  registerAsyncAgentCalls.length = 0
  lifecycleCalls.length = 0
  lifecyclePromise = new Promise(() => {})
  process.env.NCODE_BUILD_MODE = 'noumena'
  delete process.env.USER_TYPE
  process.env.CLAUDE_CODE_VERIFY_PLAN = '1'
})

afterEach(() => {
  if (originalBuildMode === undefined) {
    delete process.env.NCODE_BUILD_MODE
  } else {
    process.env.NCODE_BUILD_MODE = originalBuildMode
  }

  if (originalUserType === undefined) {
    delete process.env.USER_TYPE
  } else {
    process.env.USER_TYPE = originalUserType
  }

  if (originalVerifyPlan === undefined) {
    delete process.env.CLAUDE_CODE_VERIFY_PLAN
  } else {
    process.env.CLAUDE_CODE_VERIFY_PLAN = originalVerifyPlan
  }
})

describe('VerifyPlanExecutionTool runtime contract', () => {
  it('is disabled when called from a subagent context', async () => {
    const result = await VerifyPlanExecutionTool.call(
      {},
      createToolUseContext(undefined, 'subagent-1'),
      async () => true,
      { requestId: 'req-1' } as never,
    )

    expect(result.data).toMatchObject({
      status: 'disabled',
    })
    expect(result.data.message).toContain('main thread')
  })

  it('is disabled when plan verification is not enabled', async () => {
    delete process.env.CLAUDE_CODE_VERIFY_PLAN

    const result = await VerifyPlanExecutionTool.call(
      {},
      createToolUseContext(),
      async () => true,
      { requestId: 'req-2' } as never,
    )

    expect(result.data).toMatchObject({
      status: 'disabled',
    })
    expect(result.data.message).toContain('Plan verification is not enabled.')
  })

  it('reports when no pending plan verification exists', async () => {
    const result = await VerifyPlanExecutionTool.call(
      {},
      createToolUseContext(),
      async () => true,
      { requestId: 'req-3' } as never,
    )

    expect(result.data).toEqual({
      status: 'no_pending_plan',
      message:
        'No pending plan verification was found. Continue implementation or exit plan mode first.',
    })
  })

  it('reports already-started and already-completed pending verifications', async () => {
    const startedResult = await VerifyPlanExecutionTool.call(
      {},
      createToolUseContext({
        pendingPlanVerification: {
          plan: 'Verify the plan',
          verificationStarted: true,
          verificationCompleted: false,
        },
      }),
      async () => true,
      { requestId: 'req-4' } as never,
    )
    const completedResult = await VerifyPlanExecutionTool.call(
      {},
      createToolUseContext({
        pendingPlanVerification: {
          plan: 'Verify the plan',
          verificationStarted: true,
          verificationCompleted: true,
        },
      }),
      async () => true,
      { requestId: 'req-5' } as never,
    )

    expect(startedResult.data).toEqual({
      status: 'already_started',
      message: 'Plan verification is already running in the background.',
    })
    expect(completedResult.data).toEqual({
      status: 'already_completed',
      message: 'Plan verification has already completed for this plan.',
    })
  })

  it('launches background verification for a pending plan', async () => {
    const toolUseContext = createToolUseContext({
      pendingPlanVerification: {
        plan: '1. Verify implementation',
        verificationStarted: false,
        verificationCompleted: false,
      },
    })

    const result = await VerifyPlanExecutionTool.call(
      {},
      toolUseContext,
      async () => true,
      { requestId: 'req-6' } as never,
    )

    expect(result.data).toMatchObject({
      status: 'async_launched',
      taskId: 'verify-task-1',
      outputFile: '/tmp/verify-task-1.out',
      description: 'Verify approved plan execution',
    })
    expect(toolUseContext.getAppState().pendingPlanVerification).toEqual({
      plan: '1. Verify implementation',
      verificationStarted: true,
      verificationCompleted: false,
    })
    expect(assembleToolPoolCalls).toHaveLength(1)
    expect(registerAsyncAgentCalls).toHaveLength(1)
    expect(registerAsyncAgentCalls[0]).toMatchObject({
      agentId: 'verification-agent-123',
      description: 'Verify approved plan execution',
    })
    expect(lifecycleCalls).toHaveLength(1)
    expect(lifecycleCalls[0]).toMatchObject({
      taskId: 'verify-task-1',
      description: 'Verify approved plan execution',
    })

    const block = VerifyPlanExecutionTool.mapToolResultToToolResultBlockParam(
      result.data,
      'tool-verify-1',
    )
    expect(block.tool_use_id).toBe('tool-verify-1')
    expect(block.content).toEqual([
      {
        type: 'text',
        text:
          'Plan verification launched in the background.\n' +
          'taskId: verify-task-1\n' +
          'output_file: /tmp/verify-task-1.out\n' +
          'Wait for the task notification before reporting completion.',
      },
    ])
  })
})
