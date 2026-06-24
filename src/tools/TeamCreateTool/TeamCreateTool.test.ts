import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { getDefaultAppState } from '../../state/AppStateStore.js'

const bootstrapStatePaths = [
  import.meta.resolve('../../bootstrap/state.ts'),
  import.meta.resolve('../../bootstrap/state.js'),
]
const analyticsPaths = [
  import.meta.resolve('../../services/analytics/index.ts'),
  import.meta.resolve('../../services/analytics/index.js'),
]
const swarmsEnabledPaths = [
  import.meta.resolve('../../utils/agentSwarmsEnabled.ts'),
  import.meta.resolve('../../utils/agentSwarmsEnabled.js'),
]
const cwdPaths = [
  import.meta.resolve('../../utils/cwd.ts'),
  import.meta.resolve('../../utils/cwd.js'),
]
const modelPaths = [
  import.meta.resolve('../../utils/model/model.ts'),
  import.meta.resolve('../../utils/model/model.js'),
]
const registryPaths = [
  import.meta.resolve('../../utils/swarm/backends/registry.ts'),
  import.meta.resolve('../../utils/swarm/backends/registry.js'),
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
const wordsPaths = [
  import.meta.resolve('../../utils/words.ts'),
  import.meta.resolve('../../utils/words.js'),
]

const actualBootstrapState = await import(
  import.meta.resolve('../../bootstrap/state.ts')
)
const actualTeamHelpers = await import(
  import.meta.resolve('../../utils/swarm/teamHelpers.ts')
)
const actualTeammateLayout = await import(
  import.meta.resolve('../../utils/swarm/teammateLayoutManager.ts')
)
const actualTasksModule = await import(import.meta.resolve('../../utils/tasks.ts'))

const analyticsEvents: Array<{ name: string; payload: Record<string, unknown> }> =
  []
const registeredCleanupTeams: string[] = []
const taskOperations: string[] = []

let mockExistingTeams = new Map<string, Record<string, unknown>>()
let writtenTeamFile: Record<string, unknown> | undefined

for (const bootstrapStatePath of bootstrapStatePaths) {
  mock.module(bootstrapStatePath, () => ({
    ...actualBootstrapState,
    getSessionId: () => 'session-1',
  }))
}

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

for (const cwdPath of cwdPaths) {
  mock.module(cwdPath, () => ({
    getCwd: () => '/repo/project',
  }))
}

for (const modelPath of modelPaths) {
  mock.module(modelPath, () => ({
    getDefaultMainLoopModel: () => '/default-model',
    parseUserSpecifiedModel: (model: string) => `parsed:${model}`,
  }))
}

for (const registryPath of registryPaths) {
  mock.module(registryPath, () => ({
    getResolvedTeammateMode: () => 'in-process',
  }))
}

for (const teamHelpersPath of teamHelpersPaths) {
  mock.module(teamHelpersPath, () => ({
    ...actualTeamHelpers,
    getTeamFilePath: (teamName: string) => `/tmp/${teamName}.team.json`,
    readTeamFile: (teamName: string) => mockExistingTeams.get(teamName),
    registerTeamForSessionCleanup: (teamName: string) => {
      registeredCleanupTeams.push(teamName)
    },
    sanitizeName: (teamName: string) =>
      teamName.toLowerCase().replace(/\s+/g, '-'),
    writeTeamFileAsync: async (
      teamName: string,
      teamFile: Record<string, unknown>,
    ) => {
      writtenTeamFile = teamFile
      mockExistingTeams.set(teamName, teamFile)
    },
  }))
}

for (const teammateLayoutPath of teammateLayoutPaths) {
  mock.module(teammateLayoutPath, () => ({
    ...actualTeammateLayout,
    assignTeammateColor: () => 'cyan',
  }))
}

for (const tasksPath of tasksPaths) {
  mock.module(tasksPath, () => ({
    ...actualTasksModule,
    ensureTasksDir: async (taskListId: string) => {
      taskOperations.push(`ensure:${taskListId}`)
    },
    resetTaskList: async (taskListId: string) => {
      taskOperations.push(`reset:${taskListId}`)
    },
    setLeaderTeamName: (teamName: string) => {
      taskOperations.push(`leader:${teamName}`)
    },
  }))
}

for (const wordsPath of wordsPaths) {
  mock.module(wordsPath, () => ({
    generateWordSlug: () => 'generated-team',
  }))
}

const { TeamCreateTool } = await import(import.meta.resolve('./TeamCreateTool.ts'))

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
      tools: [TeamCreateTool] as never,
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
  registeredCleanupTeams.length = 0
  taskOperations.length = 0
  mockExistingTeams = new Map()
  writtenTeamFile = undefined
})

describe('TeamCreateTool runtime contract', () => {
  it('rejects an empty team name', async () => {
    const result = await TeamCreateTool.validateInput!(
      {
        team_name: '   ',
      },
      createToolUseContext(),
    )

    expect(result.result).toBe(false)
    expect(result.message).toContain('team_name is required')
  })

  it('creates a new team, resets the task list, and updates app state', async () => {
    const toolUseContext = createToolUseContext({
      mainLoopModelForSession: '/team-model',
    })

    const result = await TeamCreateTool.call(
      {
        team_name: 'Alpha Squad',
        description: 'Verification squad',
        agent_type: 'reviewer',
      },
      toolUseContext,
    )

    expect(result.data).toMatchObject({
      team_name: 'Alpha Squad',
      team_file_path: '/tmp/Alpha Squad.team.json',
    })
    expect(writtenTeamFile).toMatchObject({
      name: 'Alpha Squad',
      description: 'Verification squad',
      leadSessionId: 'session-1',
    })
    expect(registeredCleanupTeams).toEqual(['Alpha Squad'])
    expect(taskOperations).toEqual([
      'reset:alpha-squad',
      'ensure:alpha-squad',
      'leader:alpha-squad',
    ])

    const appState = toolUseContext.getAppState()
    expect(appState.teamContext?.teamName).toBe('Alpha Squad')
    expect(appState.teamContext?.teamFilePath).toBe('/tmp/Alpha Squad.team.json')
    expect(appState.teamContext?.leadAgentId).toBe(result.data.lead_agent_id)
    expect(appState.teamContext?.teammates[result.data.lead_agent_id]).toMatchObject(
      {
        name: 'team-lead',
        agentType: 'reviewer',
        color: 'cyan',
        cwd: '/repo/project',
      },
    )
    expect(analyticsEvents).toContainEqual({
      name: 'ncode_team_created',
      payload: {
        team_name: 'Alpha Squad',
        teammate_count: 1,
        lead_agent_type: 'reviewer',
        teammate_mode: 'in-process',
      },
    })
  })

  it('generates a unique team name when the requested one already exists', async () => {
    mockExistingTeams.set('Alpha Squad', { name: 'Alpha Squad' })

    const result = await TeamCreateTool.call(
      {
        team_name: 'Alpha Squad',
      },
      createToolUseContext(),
    )

    expect(result.data.team_name).toBe('generated-team')
    expect(result.data.team_file_path).toBe('/tmp/generated-team.team.json')
  })

  it('refuses to create a new team when already leading one', async () => {
    const toolUseContext = createToolUseContext({
      teamContext: {
        teamName: 'existing-team',
        teamFilePath: '/tmp/existing-team.team.json',
        leadAgentId: 'team-lead@existing-team',
        teammates: {},
      },
    })

    await expect(
      TeamCreateTool.call(
        {
          team_name: 'Alpha Squad',
        },
        toolUseContext,
      ),
    ).rejects.toThrow('Already leading team "existing-team"')
  })
})
