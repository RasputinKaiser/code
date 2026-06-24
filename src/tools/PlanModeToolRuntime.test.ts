import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { mkdtemp, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { getDefaultAppState } from '../state/AppStateStore.js'

const bootstrapCalls = {
  transitions: [] as Array<{ from: string; to: string }>,
  setHasExitedPlanMode: [] as boolean[],
  setNeedsPlanModeExitAttachment: [] as boolean[],
  setNeedsAutoModeExitAttachment: [] as boolean[],
}
const persistCalls: string[] = []

let mockPlanPath = ''
let mockStoredPlan = 'Plan from disk'
let mockIsTeammate = false
let mockPlanModeRequired = false
let mockAutoModeActive = false

const bootstrapStatePaths = [
  import.meta.resolve('../bootstrap/state.ts'),
  import.meta.resolve('../bootstrap/state.js'),
]
const permissionUpdatePaths = [
  import.meta.resolve('../utils/permissions/PermissionUpdate.ts'),
  import.meta.resolve('../utils/permissions/PermissionUpdate.js'),
]
const permissionSetupPaths = [
  import.meta.resolve('../utils/permissions/permissionSetup.ts'),
  import.meta.resolve('../utils/permissions/permissionSetup.js'),
]
const plansPaths = [
  import.meta.resolve('../utils/plans.ts'),
  import.meta.resolve('../utils/plans.js'),
]
const teammatePaths = [
  import.meta.resolve('../utils/teammate.ts'),
  import.meta.resolve('../utils/teammate.js'),
]
const swarmPaths = [
  import.meta.resolve('../utils/agentSwarmsEnabled.ts'),
  import.meta.resolve('../utils/agentSwarmsEnabled.js'),
]
const autoModeStatePaths = [
  import.meta.resolve('../utils/permissions/autoModeState.ts'),
  import.meta.resolve('../utils/permissions/autoModeState.js'),
]

const actualBootstrapState = await import(
  import.meta.resolve('../bootstrap/state.ts'),
)
const actualPlans = await import(import.meta.resolve('../utils/plans.ts'))
const actualTeammate = await import(import.meta.resolve('../utils/teammate.ts'))

for (const bootstrapStatePath of bootstrapStatePaths) {
  mock.module(bootstrapStatePath, () => ({
    ...actualBootstrapState,
    getAllowedChannels: () => [],
    handlePlanModeTransition(from: string, to: string) {
      bootstrapCalls.transitions.push({ from, to })
    },
    hasExitedPlanModeInSession: () => false,
    setHasExitedPlanMode(value: boolean) {
      bootstrapCalls.setHasExitedPlanMode.push(value)
    },
    setNeedsPlanModeExitAttachment(value: boolean) {
      bootstrapCalls.setNeedsPlanModeExitAttachment.push(value)
    },
    setNeedsAutoModeExitAttachment(value: boolean) {
      bootstrapCalls.setNeedsAutoModeExitAttachment.push(value)
    },
  }))
}

for (const permissionUpdatePath of permissionUpdatePaths) {
  mock.module(permissionUpdatePath, () => ({
    applyPermissionUpdate(context: Record<string, unknown>, update: { mode: string }) {
      return {
        ...context,
        mode: update.mode,
      }
    },
  }))
}

for (const permissionSetupPath of permissionSetupPaths) {
  mock.module(permissionSetupPath, () => ({
    prepareContextForPlanMode(context: Record<string, unknown>) {
      return {
        ...context,
        prePlanMode: context.mode,
      }
    },
    isAutoModeGateEnabled: () => true,
    getAutoModeUnavailableReason: () => 'circuit-breaker',
    getAutoModeUnavailableNotification: () => 'auto mode unavailable',
    stripDangerousPermissionsForAutoMode: (context: Record<string, unknown>) =>
      context,
    restoreDangerousPermissions: (context: Record<string, unknown>) => context,
  }))
}

for (const plansPath of plansPaths) {
  mock.module(plansPath, () => ({
    ...actualPlans,
    getPlanFilePath: () => mockPlanPath,
    getPlan: () => mockStoredPlan,
    persistFileSnapshotIfRemote() {
      persistCalls.push(mockPlanPath)
    },
  }))
}

for (const teammatePath of teammatePaths) {
  mock.module(teammatePath, () => ({
    ...actualTeammate,
    isTeammate: () => mockIsTeammate,
    isPlanModeRequired: () => mockPlanModeRequired,
    getAgentName: () => 'worker-1',
    getTeamName: () => 'team-alpha',
  }))
}

for (const swarmPath of swarmPaths) {
  mock.module(swarmPath, () => ({
    isAgentSwarmsEnabled: () => false,
  }))
}

for (const autoModeStatePath of autoModeStatePaths) {
  mock.module(autoModeStatePath, () => ({
    isAutoModeActive: () => mockAutoModeActive,
    setAutoModeActive: (_value: boolean) => {},
  }))
}

const { EnterPlanModeTool } = await import(
  import.meta.resolve('./EnterPlanModeTool/EnterPlanModeTool.ts'),
)
const { ExitPlanModeV2Tool } = await import(
  import.meta.resolve('./ExitPlanModeTool/ExitPlanModeV2Tool.ts'),
)

function createToolUseContext(
  tools: Array<{ name: string; userFacingName: () => string }>,
  mode: 'default' | 'plan' | 'auto' = 'default',
  prePlanMode?: 'default' | 'plan' | 'auto',
) {
  let appState = getDefaultAppState()
  appState = {
    ...appState,
    toolPermissionContext: {
      ...appState.toolPermissionContext,
      mode,
      prePlanMode,
    },
  }

  const notifications: Array<{ key?: string; text?: string }> = []
  const setAppState = (updater: (prev: typeof appState) => typeof appState) => {
    appState = updater(appState)
  }

  return {
    notifications,
    context: {
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
      addNotification(notification: { key?: string; text?: string }) {
        notifications.push(notification)
      },
      messages: [],
    } as never,
  }
}

beforeEach(async () => {
  bootstrapCalls.transitions.length = 0
  bootstrapCalls.setHasExitedPlanMode.length = 0
  bootstrapCalls.setNeedsPlanModeExitAttachment.length = 0
  bootstrapCalls.setNeedsAutoModeExitAttachment.length = 0
  persistCalls.length = 0
  mockIsTeammate = false
  mockPlanModeRequired = false
  mockAutoModeActive = false
  mockStoredPlan = 'Plan from disk'
  const planDir = await mkdtemp(join(tmpdir(), 'ncode-plan-mode-'))
  mockPlanPath = join(planDir, 'plan.md')
})

describe('plan-mode tool runtime contract', () => {
  it('enters plan mode and updates permission state for the main thread', async () => {
    const { context } = createToolUseContext([EnterPlanModeTool], 'default')

    const result = await EnterPlanModeTool.call!(
      {},
      context,
      async (_tool, input) => ({
        behavior: 'allow',
        updatedInput: input,
      }),
      {} as never,
    )

    expect(result.data.message).toContain('Entered plan mode')
    expect(bootstrapCalls.transitions).toEqual([
      { from: 'default', to: 'plan' },
    ])
    expect(context.getAppState().toolPermissionContext.mode).toBe('plan')
    expect(context.getAppState().toolPermissionContext.prePlanMode).toBe(
      'default',
    )
  })

  it('rejects EnterPlanMode in agent contexts', async () => {
    const { context } = createToolUseContext([EnterPlanModeTool], 'default')
    context.agentId = 'agent-1'

    await expect(
      EnterPlanModeTool.call!(
        {},
        context,
        async (_tool, input) => ({
          behavior: 'allow',
          updatedInput: input,
        }),
        {} as never,
      ),
    ).rejects.toThrow('EnterPlanMode tool cannot be used in agent contexts')
  })

  it('rejects ExitPlanMode validation outside plan mode', async () => {
    const { context } = createToolUseContext([ExitPlanModeV2Tool], 'default')

    const result = await ExitPlanModeV2Tool.validateInput!(
      {},
      context,
    )

    expect(result).toEqual({
      result: false,
      message:
        'You are not in plan mode. This tool is only for exiting plan mode after writing a plan. If your plan was already approved, continue with implementation.',
      errorCode: 1,
    })
  })

  it('uses permission bypass for teammates and ask flow for the main thread', async () => {
    const { context } = createToolUseContext([ExitPlanModeV2Tool], 'plan')

    const mainThreadPermission = await ExitPlanModeV2Tool.checkPermissions!(
      {},
      context,
    )
    expect(mainThreadPermission).toEqual({
      behavior: 'ask',
      message: 'Exit plan mode?',
      updatedInput: {},
    })

    mockIsTeammate = true
    const teammatePermission = await ExitPlanModeV2Tool.checkPermissions!(
      {},
      context,
    )
    expect(teammatePermission).toEqual({
      behavior: 'allow',
      updatedInput: {},
    })
  })

  it('exits plan mode, persists an edited plan, and restores the previous permission mode', async () => {
    const { context, notifications } = createToolUseContext(
      [ExitPlanModeV2Tool],
      'plan',
      'default',
    )

    const editedPlan = '1. Inspect the codebase\n2. Update the implementation'
    const result = await ExitPlanModeV2Tool.call!(
      {
        allowedPrompts: [],
        plan: editedPlan,
      } as never,
      context,
      async (_tool, input) => ({
        behavior: 'allow',
        updatedInput: input,
      }),
      {} as never,
    )

    expect(result.data).toMatchObject({
      plan: editedPlan,
      isAgent: false,
      filePath: mockPlanPath,
      planWasEdited: true,
    })
    expect(await readFile(mockPlanPath, 'utf-8')).toBe(editedPlan)
    expect(persistCalls).toEqual([mockPlanPath])
    expect(context.getAppState().toolPermissionContext.mode).toBe('default')
    expect(context.getAppState().toolPermissionContext.prePlanMode).toBeUndefined()
    expect(bootstrapCalls.setHasExitedPlanMode).toEqual([true])
    expect(bootstrapCalls.setNeedsPlanModeExitAttachment).toEqual([true])
    expect(bootstrapCalls.setNeedsAutoModeExitAttachment).toEqual([])
    expect(notifications).toEqual([])

    const toolResult = ExitPlanModeV2Tool.mapToolResultToToolResultBlockParam(
      result.data,
      'toolu_plan',
    ) as { content: string }
    expect(toolResult.content).toContain('User has approved your plan')
    expect(toolResult.content).toContain(editedPlan)
    expect(toolResult.content).toContain(mockPlanPath)
  })
})
