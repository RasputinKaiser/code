import { beforeEach, describe, expect, it, mock } from 'bun:test'

const bootstrapCalls = {
  kairos: [] as boolean[],
  userMsgOptIn: [] as boolean[],
  remoteMode: [] as boolean[],
}

const remoteAuthCalls: string[] = []

const remoteCapabilityPaths = [
  import.meta.resolve('../../auth/capabilities/remote.ts'),
  import.meta.resolve('../../auth/capabilities/remote.js'),
]
const bootstrapStatePaths = [
  import.meta.resolve('../../bootstrap/state.ts'),
  import.meta.resolve('../../bootstrap/state.js'),
]

const actualRemoteCapability = await import(
  import.meta.resolve('../../auth/capabilities/remote.ts')
)
const actualBootstrapState = await import(
  import.meta.resolve('../../bootstrap/state.ts')
)

for (const remoteCapabilityPath of remoteCapabilityPaths) {
  mock.module(remoteCapabilityPath, () => ({
    ...actualRemoteCapability,
    async resolveManagedRemoteRuntimeAuth() {
      remoteAuthCalls.push('runtime-auth')
      return {
        getAccessToken() {
          return 'fresh-token'
        },
        onAuth401: async () => false,
        refreshAccessToken: async () => 'fresh-token',
        orgUUID: 'org-123',
        session: {
          principalSource: 'managed_oauth',
          sessionState: 'usable',
        },
      }
    },
  }))
}

for (const bootstrapStatePath of bootstrapStatePaths) {
  mock.module(bootstrapStatePath, () => ({
    ...actualBootstrapState,
    setKairosActive(value: boolean) {
      bootstrapCalls.kairos.push(value)
    },
    setUserMsgOptIn(value: boolean) {
      bootstrapCalls.userMsgOptIn.push(value)
    },
    setIsRemoteMode(value: boolean) {
      bootstrapCalls.remoteMode.push(value)
    },
  }))
}

const assistantModule = await import(import.meta.resolve('./assistant.tsx'))
const { attachToAssistantSession } = assistantModule

beforeEach(() => {
  bootstrapCalls.kairos.length = 0
  bootstrapCalls.userMsgOptIn.length = 0
  bootstrapCalls.remoteMode.length = 0
  remoteAuthCalls.length = 0
})

describe('/assistant attach flow', () => {
  it('switches the current REPL into assistant viewer mode', async () => {
    let appState: any = {
      expandedView: 'tasks',
      isBriefOnly: false,
      selectedIPAgentIndex: 2,
      coordinatorTaskIndex: 4,
      viewSelectionMode: 'viewing-agent',
      footerSelection: 'tasks',
      kairosEnabled: true,
      remoteSessionUrl: 'https://old-session',
      remoteConnectionStatus: 'disconnected',
      remoteBackgroundTaskCount: 9,
      replBridgeEnabled: true,
      replBridgeExplicit: true,
      replBridgeOutboundOnly: true,
      replBridgeConnected: true,
      replBridgeSessionActive: true,
      replBridgeReconnecting: true,
      replBridgeConnectUrl: 'https://bridge-connect',
      replBridgeSessionUrl: 'https://bridge-session',
      replBridgeEnvironmentId: 'env-1',
      replBridgeSessionId: 'bridge-1',
      replBridgeError: 'boom',
      replBridgeInitialName: 'bridge',
      showRemoteCallout: true,
      tasks: { local: { id: 'local' } },
      agentNameRegistry: new Map([['worker', 'agent-1']]),
      foregroundedTaskId: 'local',
      viewingAgentTaskId: 'viewed',
      companionReaction: 'hi',
    }
    let remoteConfig: any
    let messages: any[] = []

    await attachToAssistantSession('session-12345678', {
      setRemoteSessionConfig(config) {
        remoteConfig = config
      },
      setAppState(updater) {
        appState = updater(appState)
      },
      setMessages(updater) {
        messages = updater(messages)
      },
    } as never)

    expect(remoteAuthCalls).toEqual(['runtime-auth'])
    expect(bootstrapCalls).toEqual({
      kairos: [true],
      userMsgOptIn: [true],
      remoteMode: [true],
    })

    expect(remoteConfig).toMatchObject({
      sessionId: 'session-12345678',
      orgUuid: 'org-123',
      hasInitialPrompt: false,
      viewerOnly: true,
    })
    expect(remoteConfig.getAccessToken()).toBe('fresh-token')

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      type: 'system',
      subtype: 'informational',
      level: 'info',
      content: expect.stringContaining(
        'Attached to assistant session session-',
      ),
    })

    expect(appState).toMatchObject({
      expandedView: 'none',
      isBriefOnly: true,
      selectedIPAgentIndex: -1,
      coordinatorTaskIndex: -1,
      viewSelectionMode: 'none',
      footerSelection: null,
      kairosEnabled: false,
      remoteSessionUrl: undefined,
      remoteConnectionStatus: 'connecting',
      remoteBackgroundTaskCount: 0,
      replBridgeEnabled: false,
      replBridgeExplicit: false,
      replBridgeOutboundOnly: false,
      replBridgeConnected: false,
      replBridgeSessionActive: false,
      replBridgeReconnecting: false,
      replBridgeConnectUrl: undefined,
      replBridgeSessionUrl: undefined,
      replBridgeEnvironmentId: undefined,
      replBridgeSessionId: undefined,
      replBridgeError: undefined,
      replBridgeInitialName: undefined,
      showRemoteCallout: false,
      tasks: {},
      foregroundedTaskId: undefined,
      viewingAgentTaskId: undefined,
      companionReaction: undefined,
    })
    expect(appState.agentNameRegistry).toBeInstanceOf(Map)
    expect(appState.agentNameRegistry.size).toBe(0)
  })

  it('fails cleanly when the REPL does not expose remote session activation', async () => {
    await expect(
      attachToAssistantSession('session-12345678', {
        setAppState() {},
        setMessages() {
          return []
        },
      } as never),
    ).rejects.toThrow('Assistant attach is not available in this environment.')
  })
})
