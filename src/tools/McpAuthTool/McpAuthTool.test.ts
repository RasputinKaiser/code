import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

let clearMcpAuthCacheCalls = 0
let reconnectCalls: Array<{
  serverName: string
  config: Record<string, unknown>
}> = []
let performOAuthFlowImpl: (
  serverName: string,
  config: Record<string, unknown>,
  onAuthorizationUrl: (url: string) => void,
) => Promise<void>

const authPaths = [
  import.meta.resolve('../../services/mcp/auth.ts'),
  import.meta.resolve('../../services/mcp/auth.js'),
]
const clientPaths = [
  import.meta.resolve('../../services/mcp/client.ts'),
  import.meta.resolve('../../services/mcp/client.js'),
]

for (const authPath of authPaths) {
  mock.module(authPath, () => ({
    performMCPOAuthFlow(
      serverName: string,
      config: Record<string, unknown>,
      onAuthorizationUrl: (url: string) => void,
    ) {
      return performOAuthFlowImpl(serverName, config, onAuthorizationUrl)
    },
  }))
}

for (const clientPath of clientPaths) {
  mock.module(clientPath, () => ({
    clearMcpAuthCache() {
      clearMcpAuthCacheCalls += 1
    },
    async reconnectMcpServerImpl(
      serverName: string,
      config: Record<string, unknown>,
    ) {
      reconnectCalls.push({ serverName, config })
      return {
        client: { name: serverName, type: 'connected' },
        tools: [{ name: `mcp__${serverName}__realTool` }],
        commands: [{ name: `mcp__${serverName}__realCommand` }],
        resources: [{ uri: `resource://${serverName}` }],
      }
    },
  }))
}

const { createMcpAuthTool } = await import('./McpAuthTool.ts')

function createToolUseContext(serverName: string) {
  let appState = {
    mcp: {
      clients: [{ name: serverName, type: 'failed' }, { name: 'other' }],
      tools: [
        { name: `mcp__${serverName}__authenticate` },
        { name: `mcp__${serverName}__legacyTool` },
        { name: 'Read' },
      ],
      commands: [
        { name: `mcp__${serverName}__legacyCommand` },
        { name: 'OtherCommand' },
      ],
      resources: {},
    },
  }

  return {
    getAppState: () => appState,
    setAppState(updater: (prev: typeof appState) => typeof appState) {
      appState = updater(appState)
    },
  } as never
}

async function flushBackgroundWork() {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  clearMcpAuthCacheCalls = 0
  reconnectCalls = []
  performOAuthFlowImpl = async (_serverName, _config, onAuthorizationUrl) => {
    onAuthorizationUrl('https://auth.example.test/authorize')
  }
})

afterEach(() => {
  clearMcpAuthCacheCalls = 0
  reconnectCalls = []
})

describe('McpAuthTool runtime contract', () => {
  it('returns unsupported guidance for managed-proxy connectors', async () => {
    const tool = createMcpAuthTool('slack', {
      type: 'managed-proxy',
    } as never)

    expect(tool.name).toBe('mcp__slack__authenticate')
    expect(tool.userFacingName!()).toBe('slack - authenticate (MCP)')
    expect(await tool.description!()).toContain('requires authentication')
    expect(await tool.checkPermissions!({})).toEqual({
      behavior: 'allow',
      updatedInput: {},
    })

    const result = await tool.call!({}, createToolUseContext('slack'))
    expect(result.data).toEqual({
      status: 'unsupported',
      message:
        'This is a managed MCP connector. Ask the user to run /mcp and select "slack" to authenticate.',
    })
    expect(clearMcpAuthCacheCalls).toBe(0)
    expect(reconnectCalls).toEqual([])
  })

  it('returns unsupported guidance for non-OAuth transports', async () => {
    const tool = createMcpAuthTool('filesystem', {
      type: 'stdio',
    } as never)

    const result = await tool.call!({}, createToolUseContext('filesystem'))
    expect(result.data).toEqual({
      status: 'unsupported',
      message:
        'Server "filesystem" uses stdio transport which does not support OAuth from this tool. Ask the user to run /mcp and authenticate manually.',
    })
    expect(clearMcpAuthCacheCalls).toBe(0)
    expect(reconnectCalls).toEqual([])
  })

  it('returns an authorization URL and swaps in the real server tools after OAuth completes', async () => {
    const config = {
      type: 'sse',
      url: 'https://mcp.example.test/sse',
      scope: 'dynamic',
    } as never
    const tool = createMcpAuthTool('calendar', config)
    const context = createToolUseContext('calendar')

    const result = await tool.call!({}, context)
    expect(result.data).toMatchObject({
      status: 'auth_url',
      authUrl: 'https://auth.example.test/authorize',
    })

    await flushBackgroundWork()

    expect(clearMcpAuthCacheCalls).toBe(1)
    expect(reconnectCalls).toEqual([
      { serverName: 'calendar', config },
    ])
    expect(context.getAppState().mcp.clients).toEqual([
      { name: 'calendar', type: 'connected' },
      { name: 'other' },
    ])
    expect(context.getAppState().mcp.tools).toEqual([
      { name: 'Read' },
      { name: 'mcp__calendar__realTool' },
    ])
    expect(context.getAppState().mcp.commands).toEqual([
      { name: 'OtherCommand' },
      { name: 'mcp__calendar__realCommand' },
    ])
    expect(context.getAppState().mcp.resources).toEqual({
      calendar: [{ uri: 'resource://calendar' }],
    })
    expect(
      tool.mapToolResultToToolResultBlockParam!(
        result.data,
        'toolu_auth_calendar',
      ),
    ).toEqual({
      tool_use_id: 'toolu_auth_calendar',
      type: 'tool_result',
      content: result.data.message,
    })
  })

  it('reports silent success when OAuth completes without an authorization URL', async () => {
    performOAuthFlowImpl = async () => {}
    const config = {
      type: 'http',
      url: 'https://mcp.example.test/http',
      scope: 'dynamic',
    } as never
    const tool = createMcpAuthTool('notion', config)
    const context = createToolUseContext('notion')

    const result = await tool.call!({}, context)
    expect(result.data).toEqual({
      status: 'auth_url',
      message:
        "Authentication completed silently for notion. The server's tools should now be available.",
    })

    await flushBackgroundWork()
    expect(clearMcpAuthCacheCalls).toBe(1)
    expect(reconnectCalls).toEqual([{ serverName: 'notion', config }])
  })

  it('returns an error result when the OAuth flow cannot be started', async () => {
    performOAuthFlowImpl = async () => {
      throw new Error('oauth bootstrap failed')
    }
    const tool = createMcpAuthTool('drive', {
      type: 'sse',
      url: 'https://mcp.example.test/drive',
      scope: 'dynamic',
    } as never)

    const result = await tool.call!({}, createToolUseContext('drive'))
    expect(result.data.status).toBe('error')
    expect(result.data.message).toContain(
      'Failed to start OAuth flow for drive: oauth bootstrap failed.',
    )
    expect(clearMcpAuthCacheCalls).toBe(0)
    expect(reconnectCalls).toEqual([])
  })
})
