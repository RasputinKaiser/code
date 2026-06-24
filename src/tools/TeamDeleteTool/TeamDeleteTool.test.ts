import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { getDefaultAppState } from '../../state/AppStateStore.js'

const analyticsPaths = [
  import.meta.resolve('../../services/analytics/index.ts'),
  import.meta.resolve('../../services/analytics/index.js'),
]
const swarmsEnabledPaths = [
  import.meta.resolve('../../utils/agentSwarmsEnabled.ts'),
  import.meta.resolve('../../utils/agentSwarmsEnabled.js'),
]
const teamHelpersPaths = [
  import.meta.resolve('../../utils/swarm/teamHelpers.ts'),
  import.meta.resolve('../../utils/swarm/teamHelpers.js'),
]
const teammateLayoutPaths = [
  import.meta.resolve('../../utils/swarm/teammateLayoutManager.ts'),
  import.meta.resolve('../../utils/swarm/teammateLayoutManager.js'),
]
const tasksPaths = [
  import.meta.resolve('../../utils/tasks.ts'),
  import.meta.resolve('../../utils/tasks.js'),
]

const actualTeamHelpers = await import(
  import.meta.resolve('../../utils/swarm/teamHelpers.ts')
)
const actualTeammateLayout = await import(
  import.meta.resolve('../../utils/swarm/teammateLayoutManager.ts')
)
const actualTasksModule = await import(import.meta.resolve('../../utils/tasks.ts'))

const analyticsEvents: Array<{ name: string; payload: Record<string, unknown> }> =
  []
const cleanedTeams: string[] = []
const unregisteredTeams: string[] = []

let clearColorCount = 0
let clearLeaderCount = 0
let mockTeamFiles = new Map<
  string,
  {
    members: Array<{ name: string; isActive?: boolean }>
  }
>()

for (const analyticsPath of analyticsPaths) {
  mock.module(analyticsPath, () => ({
    logEvent(name: string, payload: Record<string, unknown>) {
      analyticsEvents.push({ name, payload })
    },
  }))
}

for (const swarmsEnabledPath of swarmsEnabledPaths) {
  mock.module(swarmsEnabledPath, () => ({
    isAgentSwarmsEnabled: () => true,
  }))
}

for (const teamHelpersPath of teamHelpersPaths) {
  mock.module(teamHelpersPath, () => ({
    ...actualTeamHelpers,
    cleanupTeamDirectories: async (teamName: string) => {
      cleanedTeams.push(teamName)
    },
    readTeamFile: (teamName: string) => mockTeamFiles.get(teamName),
    unregisterTeamForSessionCleanup: (teamName: string) => {
      unregisteredTeams.push(teamName)
    },
  }))
}

for (const teammateLayoutPath of teammateLayoutPaths) {
  mock.module(teammateLayoutPath, () => ({
    ...actualTeammateLayout,
    clearTeammateColors: () => {
      clearColorCount += 1
    },
  }))
}

for (const tasksPath of tasksPaths) {
  mock.module(tasksPath, () => ({
    ...actualTasksModule,
    clearLeaderTeamName: () => {
      clearLeaderCount += 1
    },
  }))
}

const { TeamDeleteTool } = await import(import.meta.resolve('./TeamDeleteTool.ts'))

function createToolUseContext(
  initialAppState?: Partial<ReturnType<typeof getDefaultAppState>>,
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
      tools: [TeamDeleteTool] as never,
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

beforeEach(() => {
  analyticsEvents.length = 0
  cleanedTeams.length = 0
  unregisteredTeams.length = 0
  clearColorCount = 0
  clearLeaderCount = 0
  mockTeamFiles = new Map()
})

describe('TeamDeleteTool runtime contract', () => {
  it('refuses cleanup while non-lead members are still active', async () => {
    mockTeamFiles.set('team-alpha', {
      members: [
        { name: 'team-lead' },
        { name: 'helper' },
        { name: 'idle-helper', isActive: false },
      ],
    })

    const toolUseContext = createToolUseContext({
      teamContext: {
        teamName: 'team-alpha',
        teamFilePath: '/tmp/team-alpha.team.json',
        leadAgentId: 'team-lead@team-alpha',
        teammates: {},
      },
      inbox: {
        messages: [{ id: 'm1', from: 'helper', text: 'hi', timestamp: 't', status: 'pending' }],
      },
    })

    const result = await TeamDeleteTool.call({}, toolUseContext)

    expect(result.data).toMatchObject({
      success: false,
      team_name: 'team-alpha',
    })
    expect(result.data.message).toContain('Cannot cleanup team with 1 active member')
    expect(result.data.message).toContain('helper')
    expect(cleanedTeams).toHaveLength(0)
    expect(toolUseContext.getAppState().teamContext?.teamName).toBe('team-alpha')
    expect(toolUseContext.getAppState().inbox.messages).toHaveLength(1)
  })

  it('cleans up an inactive team and clears team state', async () => {
    mockTeamFiles.set('team-alpha', {
      members: [
        { name: 'team-lead' },
        { name: 'helper', isActive: false },
      ],
    })

    const toolUseContext = createToolUseContext({
      teamContext: {
        teamName: 'team-alpha',
        teamFilePath: '/tmp/team-alpha.team.json',
        leadAgentId: 'team-lead@team-alpha',
        teammates: {},
      },
      inbox: {
        messages: [{ id: 'm1', from: 'helper', text: 'hi', timestamp: 't', status: 'pending' }],
      },
    })

    const result = await TeamDeleteTool.call({}, toolUseContext)

    expect(result.data).toMatchObject({
      success: true,
      message: 'Cleaned up directories and worktrees for team "team-alpha"',
      team_name: 'team-alpha',
    })
    expect(cleanedTeams).toEqual(['team-alpha'])
    expect(unregisteredTeams).toEqual(['team-alpha'])
    expect(clearColorCount).toBe(1)
    expect(clearLeaderCount).toBe(1)
    expect(toolUseContext.getAppState().teamContext).toBeUndefined()
    expect(toolUseContext.getAppState().inbox.messages).toEqual([])
    expect(analyticsEvents).toContainEqual({
      name: 'ncode_team_deleted',
      payload: {
        team_name: 'team-alpha',
      },
    })
  })
})
