import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { z } from 'zod/v4'
import { getDefaultAppState } from '../state/AppStateStore.js'
import { AGENT_TOOL_NAME } from './AgentTool/constants.js'

type MockAgentDefinition = {
  agentType: string
  whenToUse: string
  source: 'built-in'
  baseDir: 'built-in'
  getSystemPrompt: () => string
  color?: string
  model?: string
  background?: boolean
  isolation?: 'worktree' | 'remote'
  requiredMcpServers?: string[]
}

const analyticsEvents: Array<{ name: string; payload: Record<string, unknown> }> =
  []

let mockSwarmsEnabled = false
let mockIsTeammate = false
let mockIsInProcessTeammate = false
let mockSpawnResult = {
  teammate_id: 'tm-1',
  agent_id: 'agent-1',
  name: 'helper',
  tmux_session_name: 'swarm',
  tmux_window_name: 'helper',
  tmux_pane_id: '%1',
  team_name: 'team-alpha',
}

const bootstrapStatePaths = [
  import.meta.resolve('../bootstrap/state.ts'),
  import.meta.resolve('../bootstrap/state.js'),
]
const promptPaths = [
  import.meta.resolve('../constants/prompts.ts'),
  import.meta.resolve('../constants/prompts.js'),
]
const coordinatorModePaths = [
  import.meta.resolve('../coordinator/coordinatorMode.ts'),
  import.meta.resolve('../coordinator/coordinatorMode.js'),
]
const agentSummaryPaths = [
  import.meta.resolve('../services/AgentSummary/agentSummary.ts'),
  import.meta.resolve('../services/AgentSummary/agentSummary.js'),
]
const growthbookPaths = [
  import.meta.resolve('../services/analytics/growthbook.ts'),
  import.meta.resolve('../services/analytics/growthbook.js'),
]
const analyticsPaths = [
  import.meta.resolve('../services/analytics/index.ts'),
  import.meta.resolve('../services/analytics/index.js'),
]
const dumpPromptPaths = [
  import.meta.resolve('../services/api/dumpPrompts.ts'),
  import.meta.resolve('../services/api/dumpPrompts.js'),
]
const localAgentTaskPaths = [
  import.meta.resolve('../tasks/LocalAgentTask/LocalAgentTask.ts'),
  import.meta.resolve('../tasks/LocalAgentTask/LocalAgentTask.js'),
]
const remoteAgentTaskPaths = [
  import.meta.resolve('../tasks/RemoteAgentTask/RemoteAgentTask.ts'),
  import.meta.resolve('../tasks/RemoteAgentTask/RemoteAgentTask.js'),
]
const toolsPaths = [
  import.meta.resolve('../tools.ts'),
  import.meta.resolve('../tools.js'),
]
const agentContextPaths = [
  import.meta.resolve('../utils/agentContext.ts'),
  import.meta.resolve('../utils/agentContext.js'),
]
const swarmsEnabledPaths = [
  import.meta.resolve('../utils/agentSwarmsEnabled.ts'),
  import.meta.resolve('../utils/agentSwarmsEnabled.js'),
]
const cwdPaths = [
  import.meta.resolve('../utils/cwd.ts'),
  import.meta.resolve('../utils/cwd.js'),
]
const debugPaths = [
  import.meta.resolve('../utils/debug.ts'),
  import.meta.resolve('../utils/debug.js'),
]
const errorsPaths = [
  import.meta.resolve('../utils/errors.ts'),
  import.meta.resolve('../utils/errors.js'),
]
const modelAgentPaths = [
  import.meta.resolve('../utils/model/agent.ts'),
  import.meta.resolve('../utils/model/agent.js'),
]
const permissionsPaths = [
  import.meta.resolve('../utils/permissions/permissions.ts'),
  import.meta.resolve('../utils/permissions/permissions.js'),
]
const sdkEventQueuePaths = [
  import.meta.resolve('../utils/sdkEventQueue.ts'),
  import.meta.resolve('../utils/sdkEventQueue.js'),
]
const sessionStoragePaths = [
  import.meta.resolve('../utils/sessionStorage.ts'),
  import.meta.resolve('../utils/sessionStorage.js'),
]
const sleepPaths = [
  import.meta.resolve('../utils/sleep.ts'),
  import.meta.resolve('../utils/sleep.js'),
]
const systemPromptPaths = [
  import.meta.resolve('../utils/systemPrompt.ts'),
  import.meta.resolve('../utils/systemPrompt.js'),
]
const systemPromptTypePaths = [
  import.meta.resolve('../utils/systemPromptType.ts'),
  import.meta.resolve('../utils/systemPromptType.js'),
]
const diskOutputPaths = [
  import.meta.resolve('../utils/task/diskOutput.ts'),
  import.meta.resolve('../utils/task/diskOutput.js'),
]
const teammatePaths = [
  import.meta.resolve('../utils/teammate.ts'),
  import.meta.resolve('../utils/teammate.js'),
]
const teammateContextPaths = [
  import.meta.resolve('../utils/teammateContext.ts'),
  import.meta.resolve('../utils/teammateContext.js'),
]
const teleportPaths = [
  import.meta.resolve('../utils/teleport.tsx'),
  import.meta.resolve('../utils/teleport.js'),
]
const tokensPaths = [
  import.meta.resolve('../utils/tokens.ts'),
  import.meta.resolve('../utils/tokens.js'),
]
const uuidPaths = [
  import.meta.resolve('../utils/uuid.ts'),
  import.meta.resolve('../utils/uuid.js'),
]
const worktreePaths = [
  import.meta.resolve('../utils/worktree.ts'),
  import.meta.resolve('../utils/worktree.js'),
]
const spawnMultiAgentPaths = [
  import.meta.resolve('./shared/spawnMultiAgent.ts'),
  import.meta.resolve('./shared/spawnMultiAgent.js'),
]
const agentColorPaths = [
  import.meta.resolve('./AgentTool/agentColorManager.ts'),
  import.meta.resolve('./AgentTool/agentColorManager.js'),
]
const agentToolUtilsPaths = [
  import.meta.resolve('./AgentTool/agentToolUtils.ts'),
  import.meta.resolve('./AgentTool/agentToolUtils.js'),
]
const generalPurposePaths = [
  import.meta.resolve('./AgentTool/built-in/generalPurposeAgent.ts'),
  import.meta.resolve('./AgentTool/built-in/generalPurposeAgent.js'),
]
const forkSubagentPaths = [
  import.meta.resolve('./AgentTool/forkSubagent.ts'),
  import.meta.resolve('./AgentTool/forkSubagent.js'),
]
const loadAgentsDirPaths = [
  import.meta.resolve('./AgentTool/loadAgentsDir.ts'),
  import.meta.resolve('./AgentTool/loadAgentsDir.js'),
]
const promptCategoryPaths = [
  import.meta.resolve('src/utils/promptCategory.js'),
]
const runAgentPaths = [
  import.meta.resolve('./AgentTool/runAgent.ts'),
  import.meta.resolve('./AgentTool/runAgent.js'),
]
const uiPaths = [
  import.meta.resolve('./AgentTool/UI.tsx'),
  import.meta.resolve('./AgentTool/UI.js'),
]

const actualDiskOutput = await import(
  import.meta.resolve('../utils/task/diskOutput.ts'),
)
const actualTeammate = await import(import.meta.resolve('../utils/teammate.ts'))

function parseDeniedAgents(
  context: ReturnType<typeof getDefaultAppState>['toolPermissionContext'],
  toolName: string,
) {
  const denied = new Map<string, string>()
  for (const [source, rules] of Object.entries(context.alwaysDenyRules)) {
    for (const rule of rules ?? []) {
      const match = rule.match(/^([^(]+)\((.+)\)$/)
      if (!match) continue
      if (match[1] !== toolName) continue
      denied.set(match[2], source)
    }
  }
  return denied
}

for (const bootstrapStatePath of bootstrapStatePaths) {
  mock.module(bootstrapStatePath, () => ({
    clearInvokedSkillsForAgent() {},
    getSdkAgentProgressSummariesEnabled: () => false,
  }))
}

for (const promptPath of promptPaths) {
  mock.module(promptPath, () => ({
    enhanceSystemPromptWithEnvDetails: async (prompts: string[]) => prompts,
    getSystemPrompt: async () => ['system prompt'],
  }))
}

for (const coordinatorModePath of coordinatorModePaths) {
  mock.module(coordinatorModePath, () => ({
    isCoordinatorMode: () => false,
  }))
}

for (const agentSummaryPath of agentSummaryPaths) {
  mock.module(agentSummaryPath, () => ({
    startAgentSummarization() {
      return () => {}
    },
  }))
}

for (const growthbookPath of growthbookPaths) {
  mock.module(growthbookPath, () => ({
    getFeatureValue_CACHED_MAY_BE_STALE: () => false,
  }))
}

for (const analyticsPath of analyticsPaths) {
  mock.module(analyticsPath, () => ({
    logEvent(name: string, payload: Record<string, unknown>) {
      analyticsEvents.push({ name, payload })
    },
  }))
}

for (const dumpPromptPath of dumpPromptPaths) {
  mock.module(dumpPromptPath, () => ({
    clearDumpState() {},
  }))
}

for (const localAgentTaskPath of localAgentTaskPaths) {
  mock.module(localAgentTaskPath, () => ({
    completeAgentTask() {},
    createActivityDescriptionResolver: () => () => 'Running task',
    createProgressTracker: () => ({}),
    enqueueAgentNotification() {},
    failAgentTask() {},
    getProgressUpdate: () => undefined,
    getTokenCountFromTracker: () => 0,
    isLocalAgentTask: () => false,
    killAsyncAgent() {},
    registerAgentForeground: () => 'foreground-task',
    registerAsyncAgent: () => 'async-task',
    unregisterAgentForeground() {},
    updateAgentProgress() {},
    updateProgressFromMessage() {},
  }))
}

for (const remoteAgentTaskPath of remoteAgentTaskPaths) {
  mock.module(remoteAgentTaskPath, () => ({
    checkRemoteAgentEligibility: async () => ({ eligible: true, errors: [] }),
    formatPreconditionError: (error: string) => error,
    getRemoteTaskSessionUrl: (sessionId: string) => `remote:${sessionId}`,
    registerRemoteAgentTask: () => ({
      taskId: 'remote-task',
      sessionId: 'remote-session',
    }),
  }))
}

for (const toolsPath of toolsPaths) {
  mock.module(toolsPath, () => ({
    assembleToolPool: () => [],
  }))
}

for (const agentContextPath of agentContextPaths) {
  mock.module(agentContextPath, () => ({
    runWithAgentContext: (_context: unknown, fn: () => unknown) => fn(),
  }))
}

for (const swarmsEnabledPath of swarmsEnabledPaths) {
  mock.module(swarmsEnabledPath, () => ({
    isAgentSwarmsEnabled: () => mockSwarmsEnabled,
  }))
}

for (const cwdPath of cwdPaths) {
  mock.module(cwdPath, () => ({
    getCwd: () => '/repo',
    runWithCwdOverride: <T>(_cwd: string, fn: () => T) => fn(),
  }))
}

for (const debugPath of debugPaths) {
  mock.module(debugPath, () => ({
    logForDebugging() {},
  }))
}

for (const errorsPath of errorsPaths) {
  mock.module(errorsPath, () => ({
    AbortError: class AbortError extends Error {},
    errorMessage(error: unknown) {
      return error instanceof Error ? error.message : String(error)
    },
    toError(error: unknown) {
      return error instanceof Error ? error : new Error(String(error))
    },
  }))
}

for (const modelAgentPath of modelAgentPaths) {
  mock.module(modelAgentPath, () => ({
    getAgentModel(
      agentModel: string | undefined,
      mainLoopModel: string,
      modelOverride?: string,
    ) {
      return modelOverride ?? agentModel ?? mainLoopModel
    },
  }))
}

for (const permissionsPath of permissionsPaths) {
  mock.module(permissionsPath, () => ({
    filterDeniedAgents<T extends { agentType: string }>(
      agents: T[],
      context: ReturnType<typeof getDefaultAppState>['toolPermissionContext'],
      toolName: string,
    ) {
      const denied = parseDeniedAgents(context, toolName)
      return agents.filter(agent => !denied.has(agent.agentType))
    },
    getDenyRuleForAgent(
      context: ReturnType<typeof getDefaultAppState>['toolPermissionContext'],
      toolName: string,
      agentType: string,
    ) {
      const denied = parseDeniedAgents(context, toolName)
      const source = denied.get(agentType)
      return source
        ? {
            source,
            ruleBehavior: 'deny',
            ruleValue: {
              toolName,
              ruleContent: agentType,
            },
          }
        : null
    },
  }))
}

for (const sdkEventQueuePath of sdkEventQueuePaths) {
  mock.module(sdkEventQueuePath, () => ({
    enqueueSdkEvent() {},
  }))
}

for (const sessionStoragePath of sessionStoragePaths) {
  mock.module(sessionStoragePath, () => ({
    writeAgentMetadata: async () => {},
  }))
}

for (const sleepPath of sleepPaths) {
  mock.module(sleepPath, () => ({
    sleep: async () => {},
  }))
}

for (const systemPromptPath of systemPromptPaths) {
  mock.module(systemPromptPath, () => ({
    buildEffectiveSystemPrompt: () => ['effective prompt'],
  }))
}

for (const systemPromptTypePath of systemPromptTypePaths) {
  mock.module(systemPromptTypePath, () => ({
    asSystemPrompt: (value: unknown) => value,
  }))
}

for (const diskOutputPath of diskOutputPaths) {
  mock.module(diskOutputPath, () => ({
    ...actualDiskOutput,
    getTaskOutputPath: (taskId: string) => `/tmp/${taskId}.log`,
  }))
}

for (const teammatePath of teammatePaths) {
  mock.module(teammatePath, () => ({
    ...actualTeammate,
    getParentSessionId: () => undefined,
    isTeammate: () => mockIsTeammate,
    isPlanModeRequired: () => false,
  }))
}

for (const teammateContextPath of teammateContextPaths) {
  mock.module(teammateContextPath, () => ({
    isInProcessTeammate: () => mockIsInProcessTeammate,
  }))
}

for (const teleportPath of teleportPaths) {
  mock.module(teleportPath, () => ({
    teleportToRemote: async () => null,
  }))
}

for (const tokensPath of tokensPaths) {
  mock.module(tokensPath, () => ({
    getAssistantMessageContentLength: () => 0,
  }))
}

for (const uuidPath of uuidPaths) {
  mock.module(uuidPath, () => ({
    createAgentId: () => 'agent-fixed-id',
  }))
}

for (const worktreePath of worktreePaths) {
  mock.module(worktreePath, () => ({
    createAgentWorktree: async () => null,
    hasWorktreeChanges: async () => false,
    removeAgentWorktree: async () => {},
  }))
}

for (const spawnMultiAgentPath of spawnMultiAgentPaths) {
  mock.module(spawnMultiAgentPath, () => ({
    spawnTeammate: async () => ({
      data: mockSpawnResult,
    }),
  }))
}

for (const agentColorPath of agentColorPaths) {
  mock.module(agentColorPath, () => ({
    setAgentColor() {},
  }))
}

for (const agentToolUtilsPath of agentToolUtilsPaths) {
  mock.module(agentToolUtilsPath, () => ({
    agentToolResultSchema: () =>
      z.object({
        status: z.literal('completed'),
        agentId: z.string(),
        content: z.array(z.object({ type: z.literal('text'), text: z.string() })),
        totalTokens: z.number(),
        totalToolUseCount: z.number(),
        totalDurationMs: z.number(),
        agentType: z.string().optional(),
      }),
    classifyHandoffIfNeeded: async () => undefined,
    emitTaskProgress() {},
    extractPartialResult: () => undefined,
    finalizeAgentTool: async () => undefined,
    getLastToolUseName: () => undefined,
    runAsyncAgentLifecycle: async () => undefined,
  }))
}

for (const generalPurposePath of generalPurposePaths) {
  mock.module(generalPurposePath, () => ({
    GENERAL_PURPOSE_AGENT: {
      agentType: 'general-purpose',
      whenToUse: 'General',
      source: 'built-in',
      baseDir: 'built-in',
      getSystemPrompt: () => 'general prompt',
    },
  }))
}

for (const forkSubagentPath of forkSubagentPaths) {
  mock.module(forkSubagentPath, () => ({
    buildForkedMessages: (prompt: string) => [{ type: 'user', message: { content: prompt } }],
    buildWorktreeNotice: () => 'worktree notice',
    FORK_AGENT: {
      agentType: 'fork',
      whenToUse: 'Fork',
      source: 'built-in',
      baseDir: 'built-in',
      getSystemPrompt: () => 'fork prompt',
    },
    isForkSubagentEnabled: () => false,
    isInForkChild: () => false,
  }))
}

for (const loadAgentsDirPath of loadAgentsDirPaths) {
  mock.module(loadAgentsDirPath, () => ({
    filterAgentsByMcpRequirements<T>(agents: T[]) {
      return agents
    },
    hasRequiredMcpServers(
      agent: { requiredMcpServers?: string[] },
      serversWithTools: string[],
    ) {
      return (
        agent.requiredMcpServers?.every(pattern =>
          serversWithTools.some(server =>
            server.toLowerCase().includes(pattern.toLowerCase()),
          ),
        ) ?? true
      )
    },
    isBuiltInAgent: (agent: { source: string }) => agent.source === 'built-in',
  }))
}

for (const promptCategoryPath of promptCategoryPaths) {
  mock.module(promptCategoryPath, () => ({
    getQuerySourceForAgent: () => 'agent:test',
  }))
}

for (const runAgentPath of runAgentPaths) {
  mock.module(runAgentPath, () => ({
    runAgent: async function* () {
      yield* []
    },
  }))
}

for (const uiPath of uiPaths) {
  mock.module(uiPath, () => ({
    renderGroupedAgentToolUse() {},
    renderToolResultMessage() {},
    renderToolUseErrorMessage() {},
    renderToolUseMessage() {},
    renderToolUseProgressMessage() {},
    renderToolUseRejectedMessage() {},
    renderToolUseTag() {},
    userFacingName: () => 'Agent',
    userFacingNameBackgroundColor: () => undefined,
  }))
}

const { AgentTool } = await import(import.meta.resolve('./AgentTool/AgentTool.tsx'))

function createAgent(agentType: string, overrides: Partial<MockAgentDefinition> = {}): MockAgentDefinition {
  return {
    agentType,
    whenToUse: `Use ${agentType}`,
    source: 'built-in',
    baseDir: 'built-in',
    getSystemPrompt: () => `${agentType} prompt`,
    ...overrides,
  }
}

function createToolUseContext({
  activeAgents = [],
  allAgents = activeAgents,
  allowedAgentTypes,
  permissionMode = 'default',
  denyRules,
  mcpTools = [],
  mcpClients = [],
  teamName,
}: {
  activeAgents?: MockAgentDefinition[]
  allAgents?: MockAgentDefinition[]
  allowedAgentTypes?: string[]
  permissionMode?: 'default' | 'plan' | 'auto'
  denyRules?: string[]
  mcpTools?: Array<{ name?: string }>
  mcpClients?: Array<{ name: string; type: string }>
  teamName?: string
} = {}) {
  let appState = getDefaultAppState()
  appState = {
    ...appState,
    mcp: {
      ...appState.mcp,
      tools: mcpTools as never,
      clients: mcpClients as never,
    },
    teamContext: teamName ? ({ teamName } as never) : undefined,
    toolPermissionContext: {
      ...appState.toolPermissionContext,
      mode: permissionMode,
      alwaysDenyRules: denyRules
        ? {
            ...appState.toolPermissionContext.alwaysDenyRules,
            localSettings: denyRules,
          }
        : appState.toolPermissionContext.alwaysDenyRules,
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
      tools: [AgentTool] as never,
      verbose: false,
      thinkingConfig: {} as never,
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: {
        activeAgents,
        allAgents,
        allowedAgentTypes,
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

beforeEach(() => {
  analyticsEvents.length = 0
  mockSwarmsEnabled = false
  mockIsTeammate = false
  mockIsInProcessTeammate = false
  mockSpawnResult = {
    teammate_id: 'tm-1',
    agent_id: 'agent-1',
    name: 'helper',
    tmux_session_name: 'swarm',
    tmux_window_name: 'helper',
    tmux_pane_id: '%1',
    team_name: 'team-alpha',
  }
  delete process.env.NCODE_BUILD_MODE
})

describe('AgentTool runtime contract', () => {
  it('allows subagent creation in default permission mode', async () => {
    const decision = await AgentTool.checkPermissions!(
      {
        description: 'Review code',
        prompt: 'Inspect the diff',
      },
      createToolUseContext(),
    )

    expect(decision).toEqual({
      behavior: 'allow',
      updatedInput: {
        description: 'Review code',
        prompt: 'Inspect the diff',
      },
    })
  })

  it('allows auto mode in public OSS builds even if runtime env is mutated', async () => {
    process.env.NCODE_BUILD_MODE = 'noumena'

    const decision = await AgentTool.checkPermissions!(
      {
        description: 'Review code',
        prompt: 'Inspect the diff',
      },
      createToolUseContext({ permissionMode: 'auto' }),
    )

    expect(decision).toEqual({
      behavior: 'allow',
      updatedInput: {
        description: 'Review code',
        prompt: 'Inspect the diff',
      },
    })
  })

  it('rejects team_name usage when agent swarms are disabled', async () => {
    await expect(
      AgentTool.call!(
        {
          description: 'Coordinate',
          prompt: 'Delegate the task',
          team_name: 'team-alpha',
        },
        createToolUseContext(),
        async () => ({ behavior: 'allow' }),
        {} as never,
      ),
    ).rejects.toThrow('Agent Teams is not yet available on your plan.')
  })

  it('rejects teammates spawning other teammates into a flat roster', async () => {
    mockSwarmsEnabled = true
    mockIsTeammate = true

    await expect(
      AgentTool.call!(
        {
          description: 'Coordinate',
          prompt: 'Delegate the task',
          team_name: 'team-alpha',
          name: 'worker-2',
        },
        createToolUseContext(),
        async () => ({ behavior: 'allow' }),
        {} as never,
      ),
    ).rejects.toThrow(
      'Teammates cannot spawn other teammates',
    )
  })

  it('rejects background agents for in-process teammates', async () => {
    mockSwarmsEnabled = true
    mockIsInProcessTeammate = true

    await expect(
      AgentTool.call!(
        {
          description: 'Coordinate',
          prompt: 'Delegate the task',
          team_name: 'team-alpha',
          run_in_background: true,
        },
        createToolUseContext(),
        async () => ({ behavior: 'allow' }),
        {} as never,
      ),
    ).rejects.toThrow(
      'In-process teammates cannot spawn background agents.',
    )
  })

  it('throws a denied-agent error when the requested agent type is blocked by permission rules', async () => {
    const explore = createAgent('explore')

    await expect(
      AgentTool.call!(
        {
          description: 'Explore the codebase',
          prompt: 'Search broadly',
          subagent_type: 'explore',
        },
        createToolUseContext({
          activeAgents: [explore],
          allAgents: [explore],
          denyRules: [`${AGENT_TOOL_NAME}(explore)`],
        }),
        async () => ({ behavior: 'allow' }),
        {} as never,
      ),
    ).rejects.toThrow(
      "Agent type 'explore' has been denied by permission rule 'Agent(explore)' from localSettings.",
    )
  })

  it('fails early when a selected agent requires unavailable MCP servers', async () => {
    const slackAgent = createAgent('slack-helper', {
      requiredMcpServers: ['slack'],
    })

    await expect(
      AgentTool.call!(
        {
          description: 'Use Slack',
          prompt: 'Check the latest message',
          subagent_type: 'slack-helper',
        },
        createToolUseContext({
          activeAgents: [slackAgent],
          allAgents: [slackAgent],
          mcpTools: [],
          mcpClients: [],
        }),
        async () => ({ behavior: 'allow' }),
        {} as never,
      ),
    ).rejects.toThrow(
      "Agent 'slack-helper' requires MCP servers matching: slack. MCP servers with tools: none. Use /mcp to configure and authenticate the required MCP servers.",
    )
  })

  it('routes named team spawns through spawnTeammate and returns teammate_spawned output', async () => {
    mockSwarmsEnabled = true
    const general = createAgent('general-purpose', { color: 'blue' })

    const result = await AgentTool.call!(
      {
        description: 'Coordinate',
        prompt: 'Delegate the task',
        team_name: 'team-alpha',
        name: 'helper',
        subagent_type: 'general-purpose',
      },
      createToolUseContext({
        activeAgents: [general],
        allAgents: [general],
      }),
      async () => ({ behavior: 'allow' }),
      { requestId: 'req-123' } as never,
    )

    expect(result.data).toMatchObject({
      status: 'teammate_spawned',
      prompt: 'Delegate the task',
      teammate_id: 'tm-1',
      team_name: 'team-alpha',
      name: 'helper',
    })
  })

  it('formats async and completed results for the caller', () => {
    const asyncBlock = AgentTool.mapToolResultToToolResultBlockParam!(
      {
        status: 'async_launched',
        agentId: 'agent-42',
        description: 'Run verification',
        prompt: 'Run the tests',
        outputFile: '/tmp/agent-42.log',
        canReadOutputFile: true,
      },
      'toolu_123',
    )
    const completedBlock = AgentTool.mapToolResultToToolResultBlockParam!(
      {
        status: 'completed',
        prompt: 'Run the tests',
        agentId: 'agent-42',
        agentType: 'general-purpose',
        content: [{ type: 'text', text: 'All tests passed.' }],
        totalTokens: 120,
        totalToolUseCount: 3,
        totalDurationMs: 4000,
      },
      'toolu_456',
    )

    expect(asyncBlock).toMatchObject({
      tool_use_id: 'toolu_123',
      type: 'tool_result',
    })
    expect(JSON.stringify(asyncBlock)).toContain('Async agent launched successfully.')
    expect(JSON.stringify(asyncBlock)).toContain('/tmp/agent-42.log')

    expect(completedBlock).toMatchObject({
      tool_use_id: 'toolu_456',
      type: 'tool_result',
    })
    expect(JSON.stringify(completedBlock)).toContain('All tests passed.')
    expect(JSON.stringify(completedBlock)).toContain('agentId: agent-42')
    expect(JSON.stringify(completedBlock)).toContain('<usage>total_tokens: 120')
  })
})
