import { describe, expect, it } from 'bun:test'
import type { Command } from '../../types/command.js'
import { processSlashCommand } from './processSlashCommand.tsx'

process.env.NOUMENA_API_KEY = process.env.NOUMENA_API_KEY ?? 'test-api-key'

function createContext(commands: Command[]) {
  return {
    options: {
      commands,
      tools: [],
      mainLoopModel: 'test-model',
      mcpClients: [],
      isNonInteractiveSession: false,
      querySource: 'repl_main_thread',
      dynamicMcpConfig: {},
      ideInstallationStatus: null,
      theme: 'dark',
    },
    messages: [],
    abortController: new AbortController(),
    renderedSystemPrompt: undefined,
    getAppState: () => ({
      kairosEnabled: false,
      agentDefinitions: { activeAgents: [], allAgents: [] },
      mcp: { clients: [] },
      toolPermissionContext: {
        mode: 'default',
        additionalWorkingDirectories: new Map(),
        alwaysAllowRules: {
          cliArg: [],
          session: [],
          command: [],
        },
      },
    }),
    setAppState: () => {},
    setAppStateForTasks: () => {},
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    setMessages: () => {},
    onChangeAPIKey: () => {},
    readFileState: new Map(),
  }
}

describe('processSlashCommand direct contracts', () => {
  it('preserves unknown skill args in a warning instead of dropping them', async () => {
    const result = await processSlashCommand(
      '/unknown preserve these args',
      [],
      [],
      [],
      createContext([]) as never,
      () => {},
    )

    expect(result.shouldQuery).toBe(false)
    expect(result.resultText).toBe('Unknown skill: unknown')
    expect(result.messages[0]).toMatchObject({
      type: 'user',
      isMeta: true,
    })
    expect(result.messages[1]).toMatchObject({
      type: 'user',
      message: {
        role: 'user',
        content: 'Unknown skill: unknown',
      },
    })
    expect(result.messages[2]).toMatchObject({
      type: 'system',
      level: 'warning',
      content: 'Args from unknown skill: preserve these args',
    })
  })

  it('keeps display-skip local JSX commands out of the transcript while preserving follow-up input', async () => {
    const toolJSXCalls: unknown[] = []
    const localJsxCommand: Command = {
      name: 'draft',
      description: 'Draft something locally',
      type: 'local-jsx',
      load: async () => ({
        call: async onDone => {
          onDone('hidden result', {
            display: 'skip',
            nextInput: 'follow-up prompt',
            submitNextInput: true,
          })
          return 'ignored jsx'
        },
      }),
    }

    const result = await processSlashCommand(
      '/draft investigate',
      [],
      [],
      [],
      createContext([localJsxCommand]) as never,
      update => {
        toolJSXCalls.push(update)
      },
    )

    expect(result).toMatchObject({
      messages: [],
      shouldQuery: false,
      nextInput: 'follow-up prompt',
      submitNextInput: true,
    })
    expect(toolJSXCalls).toEqual([])
  })

  it('rejects prompt skills that are reserved for NCode-only invocation', async () => {
    const modelOnlyCommand: Command = {
      name: 'secret',
      description: 'Internal model-only skill',
      type: 'prompt',
      progressMessage: 'running',
      contentLength: 0,
      source: 'builtin',
      userInvocable: false,
      async getPromptForCommand() {
        return [{ type: 'text', text: 'hidden' }]
      },
    }

    const result = await processSlashCommand(
      '/secret',
      [],
      [],
      [],
      createContext([modelOnlyCommand]) as never,
      () => {},
    )

    expect(result.shouldQuery).toBe(false)
    expect(result.messages[0]).toMatchObject({
      type: 'user',
      isMeta: true,
    })
    expect(result.messages[2]).toMatchObject({
      type: 'user',
      message: {
        role: 'user',
        content: expect.stringContaining(
          'This skill can only be invoked by NCode',
        ),
      },
    })
  })
})
