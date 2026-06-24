import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  clearRegisteredHooks,
  registerHookCallbacks,
  resetStateForTests,
} from '../../bootstrap/state.js'
import { processUserInput } from './processUserInput.js'

beforeEach(() => {
  resetStateForTests()
  clearRegisteredHooks()
})

afterEach(() => {
  clearRegisteredHooks()
  resetStateForTests()
})

function createContext() {
  return {
    options: {
      commands: [],
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

function registerUserPromptSubmitHook(
  output:
    | {
        decision: 'block'
        reason: string
      }
    | {
        continue: false
        stopReason: string
      },
) {
  registerHookCallbacks({
    UserPromptSubmit: [
      {
        hooks: [
          {
            type: 'callback',
            callback: async () => ({
              ...output,
              hookSpecificOutput: {
                hookEventName: 'UserPromptSubmit',
              },
            }),
          },
        ],
      },
    ],
  })
}

describe('processUserInput user prompt submit hooks', () => {
  it('treats a plain prompt as queryable user input', async () => {
    const result = await processUserInput({
      input: 'hi',
      mode: 'prompt',
      setToolJSX: () => {},
      context: createContext() as never,
      skipAttachments: true,
      skipSlashCommands: true,
      uuid: 'plain-user-input',
    })

    expect(result.shouldQuery).toBe(true)
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0]).toMatchObject({
      type: 'user',
      uuid: 'plain-user-input',
      message: {
        role: 'user',
        content: 'hi',
      },
    })
  })

  it('replaces the prompt with a warning system message when a hook blocks submission', async () => {
    registerUserPromptSubmitHook({
      decision: 'block',
      reason: 'Run formatter first',
    })

    const result = await processUserInput({
      input: 'fix the lint errors',
      mode: 'prompt',
      setToolJSX: () => {},
      context: createContext() as never,
      skipAttachments: true,
      skipSlashCommands: true,
    })

    expect(result.shouldQuery).toBe(false)
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0]).toMatchObject({
      type: 'system',
      level: 'warning',
      content: expect.stringMatching(
        /Run formatter first[\s\S]*Original prompt: fix the lint errors/,
      ),
    })
  })

  it('preserves the original prompt and appends a stop message when continuation is prevented', async () => {
    registerUserPromptSubmitHook({
      continue: false,
      stopReason: 'Need manual approval',
    })

    const result = await processUserInput({
      input: 'continue',
      mode: 'prompt',
      setToolJSX: () => {},
      context: createContext() as never,
      skipAttachments: true,
      skipSlashCommands: true,
      uuid: 'user-input-1',
    })

    expect(result.shouldQuery).toBe(false)
    expect(result.messages).toHaveLength(2)
    expect(result.messages[0]).toMatchObject({
      type: 'user',
      uuid: 'user-input-1',
      message: {
        role: 'user',
        content: 'continue',
      },
    })
    expect(result.messages[1]).toMatchObject({
      type: 'user',
      message: {
        role: 'user',
        content: expect.stringContaining('Need manual approval'),
      },
    })
  })
})
