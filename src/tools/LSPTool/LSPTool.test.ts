import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const managerPaths = [
  import.meta.resolve('../../services/lsp/manager.ts'),
  import.meta.resolve('../../services/lsp/manager.js'),
]
const cwdPaths = [
  import.meta.resolve('../../utils/cwd.ts'),
  import.meta.resolve('../../utils/cwd.js'),
]
const logPaths = [
  import.meta.resolve('../../utils/log.ts'),
  import.meta.resolve('../../utils/log.js'),
]

const actualLogModule = await import(import.meta.resolve('../../utils/log.ts'))
const actualCwdModule = await import(import.meta.resolve('../../utils/cwd.ts'))

let mockInitializationStatus: { status: string } = { status: 'ready' }
let waitForInitializationCalls = 0
let mockManager:
  | {
      isFileOpen: (path: string) => boolean
      openFile: (path: string, contents: string) => Promise<void>
      sendRequest: (
        path: string,
        method: string,
        params: unknown,
      ) => Promise<unknown>
    }
  | undefined

for (const managerPath of managerPaths) {
  mock.module(managerPath, () => ({
    getInitializationStatus: () => mockInitializationStatus,
    getLspServerManager: () => mockManager,
    isLspConnected: () => true,
    waitForInitialization: async () => {
      waitForInitializationCalls += 1
    },
  }))
}

for (const cwdPath of cwdPaths) {
  mock.module(cwdPath, () => ({
    ...actualCwdModule,
    pwd: () => '/repo/project',
    getCwd: () => '/repo/project',
  }))
}

for (const logPath of logPaths) {
  mock.module(logPath, () => ({
    ...actualLogModule,
    logError() {},
  }))
}

const { LSPTool } = await import(import.meta.resolve('./LSPTool.ts'))

let tempDir = ''

function createSourceFile(filename: string, contents = 'export const value = 1\n') {
  const filePath = join(tempDir, filename)
  writeFileSync(filePath, contents, 'utf-8')
  return filePath
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'lsp-tool-test-'))
  mockInitializationStatus = { status: 'ready' }
  waitForInitializationCalls = 0
  mockManager = undefined
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('LSPTool runtime contract', () => {
  it('rejects validateInput when the target file does not exist', async () => {
    const result = await LSPTool.validateInput!(
      {
        operation: 'hover',
        filePath: join(tempDir, 'missing.ts'),
        line: 1,
        character: 1,
      },
      {} as never,
    )

    expect(result.result).toBe(false)
    expect(result.message).toContain('File does not exist')
  })

  it('returns a startup issue when no LSP manager is initialized', async () => {
    const filePath = createSourceFile('sample.ts')

    const result = await LSPTool.call(
      {
        operation: 'hover',
        filePath,
        line: 1,
        character: 1,
      },
      {} as never,
    )

    expect(result.data).toEqual({
      operation: 'hover',
      result:
        'LSP server manager not initialized. This may indicate a startup issue.',
      filePath,
    })
  })

  it('waits for pending initialization and reports missing LSP server support', async () => {
    const filePath = createSourceFile('sample.ts')
    mockInitializationStatus = { status: 'pending' }
    mockManager = {
      isFileOpen: () => false,
      openFile: async () => {},
      sendRequest: async () => undefined,
    }

    const result = await LSPTool.call(
      {
        operation: 'goToDefinition',
        filePath,
        line: 1,
        character: 1,
      },
      {} as never,
    )

    expect(waitForInitializationCalls).toBe(1)
    expect(result.data).toEqual({
      operation: 'goToDefinition',
      result: 'No LSP server available for file type: .ts',
      filePath,
    })
  })

  it('maps tool results into plain text tool_result blocks', () => {
    const block = LSPTool.mapToolResultToToolResultBlockParam(
      {
        result: 'hover text',
      } as never,
      'tool-lsp-1',
    )

    expect(block).toEqual({
      tool_use_id: 'tool-lsp-1',
      type: 'tool_result',
      content: 'hover text',
    })
  })
})
