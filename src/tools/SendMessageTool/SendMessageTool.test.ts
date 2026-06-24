import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { getDefaultAppState } from '../../state/AppStateStore.js'

const bootstrapStatePaths = [
  import.meta.resolve('../../bootstrap/state.ts'),
  import.meta.resolve('../../bootstrap/state.js'),
]
const replBridgeHandlePaths = [
  import.meta.resolve('../../bridge/replBridgeHandle.ts'),
  import.meta.resolve('../../bridge/replBridgeHandle.js'),
]
const inProcessTeammateTaskPaths = [
  import.meta.resolve('../../tasks/InProcessTeammateTask/InProcessTeammateTask.ts'),
  import.meta.resolve('../../tasks/InProcessTeammateTask/InProcessTeammateTask.js'),
]
const localAgentTaskPaths = [
  import.meta.resolve('../../tasks/LocalAgentTask/LocalAgentTask.tsx'),
  import.meta.resolve('../../tasks/LocalAgentTask/LocalAgentTask.js'),
]
const localMainSessionTaskPaths = [
  import.meta.resolve('../../tasks/LocalMainSessionTask.ts'),
  import.meta.resolve('../../tasks/LocalMainSessionTask.js'),
]
const swarmsEnabledPaths = [
  import.meta.resolve('../../utils/agentSwarmsEnabled.ts'),
  import.meta.resolve('../../utils/agentSwarmsEnabled.js'),
]
const swarmTeamHelpersPaths = [
  import.meta.resolve('../../utils/swarm/teamHelpers.ts'),
  import.meta.resolve('../../utils/swarm/teamHelpers.js'),
]
const teammatePaths = [
  import.meta.resolve('../../utils/teammate.ts'),
  import.meta.resolve('../../utils/teammate.js'),
]
const teammateMailboxPaths = [
  import.meta.resolve('../../utils/teammateMailbox.ts'),
  import.meta.resolve('../../utils/teammateMailbox.js'),
]
const resumeAgentPaths = [
  import.meta.resolve('../AgentTool/resumeAgent.ts'),
  import.meta.resolve('../AgentTool/resumeAgent.js'),
]
const debugPaths = [
  import.meta.resolve('../../utils/debug.ts'),
  import.meta.resolve('../../utils/debug.js'),
]

const actualBootstrapState = await import(
  import.meta.resolve('../../bootstrap/state.ts')
)
const actualTeamHelpers = await import(
  import.meta.resolve('../../utils/swarm/teamHelpers.ts')
)
const actualLocalAgentTask = await import(
  import.meta.resolve('../../tasks/LocalAgentTask/LocalAgentTask.tsx')
)
const actualTeammateModule = await import(
  import.meta.resolve('../../utils/teammate.ts')
)
const actualMailboxModule = await import(
  import.meta.resolve('../../utils/teammateMailbox.ts')
)

const mailboxWrites: Array<{
  recipientName: string
  message: Record<string, unknown>
  teamName?: string
}> = []
const queuedMessages: Array<{ taskId: string; message: string }> = []

let mockAgentName = 'captain'
let mockAgentId = 'agent-self'
let mockTeamName = 'team-alpha'
let mockIsTeammate = false
let mockTeamFileMembers: Array<{ name: string }> = []

for (const bootstrapStatePath of bootstrapStatePaths) {
  mock.module(bootstrapStatePath, () => ({
    ...actualBootstrapState,
    isReplBridgeActive: () => false,
  }))
}

for (const replBridgeHandlePath of replBridgeHandlePaths) {
  mock.module(replBridgeHandlePath, () => ({
    getReplBridgeHandle: () => undefined,
  }))
}

for (const inProcessTeammateTaskPath of inProcessTeammateTaskPaths) {
  mock.module(inProcessTeammateTaskPath, () => ({
    findTeammateTaskByAgentId: () => undefined,
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
    queuePendingMessage(taskId: string, message: string) {
      queuedMessages.push({ taskId, message })
    },
  }))
}

for (const localMainSessionTaskPath of localMainSessionTaskPaths) {
  mock.module(localMainSessionTaskPath, () => ({
    isMainSessionTask: () => false,
  }))
}

for (const swarmsEnabledPath of swarmsEnabledPaths) {
  mock.module(swarmsEnabledPath, () => ({
    isAgentSwarmsEnabled: () => true,
  }))
}

for (const swarmTeamHelpersPath of swarmTeamHelpersPaths) {
  mock.module(swarmTeamHelpersPath, () => ({
    ...actualTeamHelpers,
    readTeamFileAsync: async () => ({
      members: mockTeamFileMembers,
    }),
  }))
}

for (const teammatePath of teammatePaths) {
  mock.module(teammatePath, () => ({
    ...actualTeammateModule,
    getAgentId: () => mockAgentId,
    getAgentName: () => mockAgentName,
    getTeammateColor: () => 'blue',
    getTeamName: () => mockTeamName,
    isTeamLead: () => !mockIsTeammate,
    isTeammate: () => mockIsTeammate,
  }))
}

for (const teammateMailboxPath of teammateMailboxPaths) {
  mock.module(teammateMailboxPath, () => ({
    ...actualMailboxModule,
    writeToMailbox: async (
      recipientName: string,
      message: Record<string, unknown>,
      teamName?: string,
    ) => {
      mailboxWrites.push({ recipientName, message, teamName })
    },
  }))
}

for (const resumeAgentPath of resumeAgentPaths) {
  mock.module(resumeAgentPath, () => ({
    resumeAgentBackground: async () => ({
      outputFile: '/tmp/resumed-agent.txt',
    }),
  }))
}

for (const debugPath of debugPaths) {
  mock.module(debugPath, () => ({
    logForDebugging() {},
  }))
}

const { SendMessageTool } = await import(import.meta.resolve('./SendMessageTool.ts'))

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
      tools: [SendMessageTool] as never,
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
    toolUseId: 'send-message-tool-use',
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
  mailboxWrites.length = 0
  queuedMessages.length = 0
  mockAgentName = 'captain'
  mockAgentId = 'agent-self'
  mockTeamName = 'team-alpha'
  mockIsTeammate = false
  mockTeamFileMembers = []
})

describe('SendMessageTool runtime contract', () => {
  it('requires a summary for plain string messages', async () => {
    const result = await SendMessageTool.validateInput!(
      {
        to: 'helper',
        message: 'hello there',
      },
      createToolUseContext(),
    )

    expect(result.result).toBe(false)
    expect(result.message).toContain('summary is required')
  })

  it('sends a plain text teammate message through the mailbox', async () => {
    const toolUseContext = createToolUseContext({
      teamContext: {
        teamName: 'team-alpha',
        teamFilePath: '/tmp/team-alpha.json',
        leadAgentId: 'team-lead@team-alpha',
        teammates: {
          helper: {
            name: 'helper',
            color: 'green',
            tmuxSessionName: '',
            tmuxPaneId: '',
            cwd: '/repo',
            spawnedAt: 0,
          },
        },
      },
    })

    const result = await SendMessageTool.call(
      {
        to: 'helper',
        summary: 'Short update',
        message: 'hello teammate',
      },
      toolUseContext,
      async () => true,
      { requestId: 'req-1' } as never,
    )

    expect(mailboxWrites).toHaveLength(1)
    expect(mailboxWrites[0]).toMatchObject({
      recipientName: 'helper',
      teamName: 'team-alpha',
    })
    expect(mailboxWrites[0]?.message).toMatchObject({
      from: 'captain',
      text: 'hello teammate',
      summary: 'Short update',
      color: 'blue',
    })
    expect(result.data).toMatchObject({
      success: true,
      message: "Message sent to helper's inbox",
      routing: {
        sender: 'captain',
        senderColor: 'blue',
        target: '@helper',
        targetColor: 'green',
        summary: 'Short update',
        content: 'hello teammate',
      },
    })
  })

  it('queues the message for a running local agent instead of writing to the mailbox', async () => {
    const toolUseContext = createToolUseContext()
    toolUseContext.getAppState().agentNameRegistry.set('helper', 'agent-1' as never)
    toolUseContext.getAppState().tasks['agent-1'] = {
      __localAgentTask: true,
      status: 'running',
    } as never

    const result = await SendMessageTool.call(
      {
        to: 'helper',
        summary: 'Follow up',
        message: 'please continue',
      },
      toolUseContext,
      async () => true,
      { requestId: 'req-2' } as never,
    )

    expect(queuedMessages).toEqual([
      { taskId: 'agent-1', message: 'please continue' },
    ])
    expect(mailboxWrites).toHaveLength(0)
    expect(result.data).toMatchObject({
      success: true,
      message: 'Message queued for delivery to helper at its next tool round.',
    })
  })
})
