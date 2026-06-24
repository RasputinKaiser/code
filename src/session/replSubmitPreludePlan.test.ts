import { describe, expect, it } from 'bun:test'
import type { Command } from '../commands.js'
import { resolveReplSubmitPreludePlan } from './replSubmitPreludePlan.js'

function createCommand(overrides: Partial<Command> = {}): Command {
  return {
    name: 'config',
    description: 'config',
    type: 'local-jsx',
    immediate: true,
    load: async () => ({ call: async () => null }),
    ...overrides,
  } as Command
}

describe('resolveReplSubmitPreludePlan', () => {
  const base = {
    inputMode: 'prompt' as const,
    hasSpeculationAccept: false,
    fromKeybinding: false,
    userType: 'ant',
    pastedContents: {},
    queryGuardActive: false,
    matchingCommand: undefined,
    isRemoteMode: false,
    willowMode: 'off',
    idleReturnDismissed: false,
    skipIdleCheck: false,
    lastQueryCompletionTimeMs: 0,
    totalInputTokens: 0,
    tokenThreshold: 100_000,
    idleThresholdMinutes: 75,
    nowMs: 0,
    expandPastedTextRefs: (input: string) => input,
    parseBackgroundPRShortcutInput: (input: string) =>
      input.startsWith('&') ? input.slice(1).trimStart() : null,
  }

  it('keeps background PR shortcut precedence ahead of the other prelude paths', () => {
    expect(
      resolveReplSubmitPreludePlan({
        ...base,
        input: '&',
      }),
    ).toEqual({ type: 'background-pr-empty-prompt' })

    expect(
      resolveReplSubmitPreludePlan({
        ...base,
        input: '& run it',
        pastedContents: {
          1: {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: 'abc',
            },
          },
        },
      }),
    ).toEqual({ type: 'background-pr-images-unsupported' })

    expect(
      resolveReplSubmitPreludePlan({
        ...base,
        input: '& run it',
      }),
    ).toEqual({ type: 'background-pr-launch', prompt: 'run it' })
  })

  it('routes immediate local-jsx submissions before remote-empty and idle-return handling', () => {
    expect(
      resolveReplSubmitPreludePlan({
        ...base,
        input: '/config foo',
        queryGuardActive: true,
        matchingCommand: createCommand(),
      }),
    ).toEqual({
      type: 'immediate-local-jsx',
      commandArgs: 'foo',
    })

    expect(
      resolveReplSubmitPreludePlan({
        ...base,
        input: '   ',
        userType: 'external',
        isRemoteMode: true,
      }),
    ).toEqual({ type: 'skip-empty-remote' })
  })

  it('opens the idle-return dialog only after earlier prelude branches are skipped', () => {
    expect(
      resolveReplSubmitPreludePlan({
        ...base,
        input: 'continue working',
        userType: 'external',
        willowMode: 'dialog',
        lastQueryCompletionTimeMs: 1000,
        totalInputTokens: 200_000,
        nowMs: 1000 + 76 * 60_000,
      }),
    ).toEqual({
      type: 'idle-return-dialog',
      preflight: {
        shouldOpenDialog: true,
        idleMinutes: 76,
      },
    })

    expect(
      resolveReplSubmitPreludePlan({
        ...base,
        input: '/config',
        userType: 'external',
        willowMode: 'dialog',
        lastQueryCompletionTimeMs: 1000,
        totalInputTokens: 200_000,
        nowMs: 1000 + 76 * 60_000,
      }),
    ).toEqual({ type: 'continue' })
  })
})
