import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { Command } from '../../types/command.js'
import { resetStateForTests } from '../../bootstrap/state.js'
import { processUserInput } from './processUserInput.js'

process.env.NOUMENA_API_KEY = process.env.NOUMENA_API_KEY ?? 'test-api-key'

beforeEach(() => {
  resetStateForTests()
})

afterEach(() => {
  resetStateForTests()
})

function createContext(commands: Command[]) {
  return {
    options: {
      commands,
      isNonInteractiveSession: false,
    },
    abortController: new AbortController(),
    getAppState: () => ({
      toolPermissionContext: { mode: 'default' },
      sessionHooks: new Map(),
      ultraplanSessionUrl: undefined,
      ultraplanLaunching: false,
    }),
    setAppState: () => {},
    updateAttributionState: () => {},
    requestPrompt: undefined,
    messages: [],
  }
}

function createLocalCommand(name: string): Command {
  return {
    type: 'local',
    name,
    description: `${name} local command`,
    supportsNonInteractive: true,
    source: 'builtin',
    load: async () => ({
      call: async () => ({ type: 'skip' }),
    }),
  } as unknown as Command
}

function createPromptCommand(name: string): Command {
  return {
    type: 'prompt',
    name,
    description: `${name} prompt command`,
    progressMessage: `${name} progress`,
    contentLength: 0,
    source: 'builtin',
    getPromptForCommand: async args => [
      {
        type: 'text',
        text: `${name} prompt: ${args}`,
      },
    ],
  } as Command
}

describe('processUserInput remote bridge slash handling', () => {
  it('blocks known but unsafe local slash commands over Remote Control', async () => {
    const result = await processUserInput({
      input: '/config profile',
      mode: 'prompt',
      setToolJSX: () => {},
      context: createContext([createLocalCommand('config')]) as never,
      skipAttachments: true,
      skipSlashCommands: true,
      bridgeOrigin: true,
      uuid: 'bridge-1',
    })

    expect(result.shouldQuery).toBe(false)
    expect(result.messages[0]).toMatchObject({
      type: 'user',
      uuid: 'bridge-1',
      message: {
        role: 'user',
        content: '/config profile',
      },
    })
    expect(result.messages[1]).toMatchObject({
      type: 'system',
      subtype: 'local_command',
      content: expect.stringContaining(
        "/config isn't available over Remote Control.",
      ),
    })
  })

  it('delegates bridge-safe prompt slash commands to real slash expansion even when slash commands are normally skipped', async () => {
    const result = await processUserInput({
      input: '/summary now',
      mode: 'prompt',
      setToolJSX: () => {},
      context: createContext([createPromptCommand('summary')]) as never,
      skipAttachments: true,
      skipSlashCommands: true,
      bridgeOrigin: true,
      uuid: 'bridge-2',
    })

    expect(result.shouldQuery).toBe(true)
    expect(result.messages).toHaveLength(3)
    expect(result.messages[0]).toMatchObject({
      type: 'user',
      uuid: 'bridge-2',
      message: {
        role: 'user',
        content: expect.stringContaining('<command-name>/summary</command-name>'),
      },
    })
    expect(result.messages[1]).toMatchObject({
      type: 'user',
      isMeta: true,
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'summary prompt: now' }],
      },
    })
    expect(result.messages[2]).toMatchObject({
      type: 'attachment',
      attachment: {
        type: 'command_permissions',
        allowedTools: [],
        model: undefined,
      },
    })
  })

  it('treats unknown slash commands from bridge clients as plain text', async () => {
    const result = await processUserInput({
      input: '/shrug',
      mode: 'prompt',
      setToolJSX: () => {},
      context: createContext([createPromptCommand('summary')]) as never,
      skipAttachments: true,
      skipSlashCommands: true,
      bridgeOrigin: true,
      uuid: 'bridge-3',
    })

    expect(result.shouldQuery).toBe(true)
    expect(result.messages[0]).toMatchObject({
      type: 'user',
      uuid: 'bridge-3',
      message: {
        role: 'user',
        content: '/shrug',
      },
    })
  })
})
