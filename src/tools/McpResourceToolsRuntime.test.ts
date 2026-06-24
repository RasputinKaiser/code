import { beforeEach, describe, expect, it, mock } from 'bun:test'

const ensureCalls: string[] = []
const fetchCalls: string[] = []
const persistCalls: Array<{ mimeType?: string; persistId: string; size: number }> =
  []
let mockPersistFailure = false

const clientPaths = [
  import.meta.resolve('../services/mcp/client.ts'),
  import.meta.resolve('../services/mcp/client.js'),
]
const outputStoragePaths = [
  import.meta.resolve('../utils/mcpOutputStorage.ts'),
  import.meta.resolve('../utils/mcpOutputStorage.js'),
]
const logPaths = [
  import.meta.resolve('../utils/log.ts'),
  import.meta.resolve('../utils/log.js'),
]

const actualClientModule = await import(
  import.meta.resolve('../services/mcp/client.ts'),
)
const actualLogModule = await import(import.meta.resolve('../utils/log.ts'))

for (const clientPath of clientPaths) {
  mock.module(clientPath, () => ({
    ...actualClientModule,
    ensureConnectedClient: async (client: Record<string, unknown>) => {
      ensureCalls.push(String(client.name))
      return client
    },
    fetchResourcesForClient: async (client: Record<string, unknown>) => {
      fetchCalls.push(String(client.name))
      return [
        {
          uri: `mcp://${client.name}/resource`,
          name: `resource-${client.name}`,
          mimeType: 'text/plain',
          description: 'Mock resource',
          server: client.name,
        },
      ]
    },
  }))
}

for (const outputStoragePath of outputStoragePaths) {
  mock.module(outputStoragePath, () => ({
    getBinaryBlobSavedMessage(filepath: string, mimeType: string | undefined, size: number, prefix: string) {
      return `${prefix}saved ${mimeType ?? 'binary'} (${size}) at ${filepath}`
    },
    persistBinaryContent: async (
      bytes: Buffer,
      mimeType: string | undefined,
      persistId: string,
    ) => {
      persistCalls.push({
        mimeType,
        persistId,
        size: bytes.length,
      })
      if (mockPersistFailure) {
        return { error: 'disk full' }
      }
      return {
        filepath: `/tmp/${persistId}.bin`,
        size: bytes.length,
      }
    },
  }))
}

for (const logPath of logPaths) {
  mock.module(logPath, () => ({
    ...actualLogModule,
    logMCPError() {},
  }))
}

const { ListMcpResourcesTool } = await import(
  import.meta.resolve('./ListMcpResourcesTool/ListMcpResourcesTool.ts'),
)
const { ReadMcpResourceTool } = await import(
  import.meta.resolve('./ReadMcpResourceTool/ReadMcpResourceTool.ts'),
)

beforeEach(() => {
  ensureCalls.length = 0
  fetchCalls.length = 0
  persistCalls.length = 0
  mockPersistFailure = false
})

describe('MCP resource tools runtime contract', () => {
  it('lists resources from connected servers and filters by server name', async () => {
    const toolUseContext = {
      options: {
        mcpClients: [
          { name: 'alpha', type: 'connected' },
          { name: 'beta', type: 'pending' },
        ],
      },
    } as never

    const result = await ListMcpResourcesTool.call!(
      { server: 'alpha' },
      toolUseContext,
    )

    expect(result.data).toEqual([
      {
        uri: 'mcp://alpha/resource',
        name: 'resource-alpha',
        mimeType: 'text/plain',
        description: 'Mock resource',
        server: 'alpha',
      },
    ])
    expect(ensureCalls).toEqual(['alpha'])
    expect(fetchCalls).toEqual(['alpha'])
  })

  it('reads text resources from a connected MCP client', async () => {
    const toolUseContext = {
      options: {
        mcpClients: [
          {
            name: 'alpha',
            type: 'connected',
            capabilities: { resources: {} },
            client: {
              request: async () => ({
                contents: [
                  {
                    uri: 'mcp://alpha/readme',
                    mimeType: 'text/plain',
                    text: 'hello resource',
                  },
                ],
              }),
            },
          },
        ],
      },
    } as never

    const result = await ReadMcpResourceTool.call!(
      { server: 'alpha', uri: 'mcp://alpha/readme' },
      toolUseContext,
    )

    expect(result.data).toEqual({
      contents: [
        {
          uri: 'mcp://alpha/readme',
          mimeType: 'text/plain',
          text: 'hello resource',
        },
      ],
    })
    expect(ensureCalls).toEqual(['alpha'])
  })

  it('persists binary MCP resource content to disk-backed storage', async () => {
    const toolUseContext = {
      options: {
        mcpClients: [
          {
            name: 'alpha',
            type: 'connected',
            capabilities: { resources: {} },
            client: {
              request: async () => ({
                contents: [
                  {
                    uri: 'mcp://alpha/image',
                    mimeType: 'image/png',
                    blob: Buffer.from('png-bytes').toString('base64'),
                  },
                ],
              }),
            },
          },
        ],
      },
    } as never

    const result = await ReadMcpResourceTool.call!(
      { server: 'alpha', uri: 'mcp://alpha/image' },
      toolUseContext,
    )

    expect(result.data.contents).toHaveLength(1)
    expect(result.data.contents[0]).toMatchObject({
      uri: 'mcp://alpha/image',
      mimeType: 'image/png',
    })
    expect(result.data.contents[0]?.blobSavedTo).toContain('/tmp/mcp-resource-')
    expect(result.data.contents[0]?.text).toContain(
      '[Resource from alpha at mcp://alpha/image] saved image/png',
    )
    expect(persistCalls).toHaveLength(1)
  })
})
