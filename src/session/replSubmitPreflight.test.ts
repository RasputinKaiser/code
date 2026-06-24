import { describe, expect, it } from 'bun:test'
import type { Command } from '../commands.js'
import {
  resolveBackgroundPRLaunchGate,
  resolveBackgroundPRShortcutCandidate,
  resolveIdleReturnDialogPreflight,
  resolveImmediateLocalJsxPreflight,
} from './replSubmitPreflight.js'

function createCommand(
  overrides: Partial<Command> = {},
): Command {
  return {
    name: 'test',
    description: 'test command',
    type: 'local-jsx',
    load: async () => ({
      call: async () => null,
    }),
    ...overrides,
  } as Command
}

describe('resolveBackgroundPRShortcutCandidate', () => {
  it('returns null unless ant prompt submit without speculation accept', () => {
    const parse = (input: string) => input

    expect(
      resolveBackgroundPRShortcutCandidate({
        hasSpeculationAccept: true,
        inputMode: 'prompt',
        userType: 'ant',
        expandedInput: '& run',
        parseBackgroundPRShortcutInput: parse,
      }),
    ).toBeNull()

    expect(
      resolveBackgroundPRShortcutCandidate({
        hasSpeculationAccept: false,
        inputMode: 'prompt',
        userType: 'external',
        expandedInput: '& run',
        parseBackgroundPRShortcutInput: parse,
      }),
    ).toBeNull()
  })

  it('delegates parsing in the supported branch', () => {
    const seen: string[] = []
    const result = resolveBackgroundPRShortcutCandidate({
      hasSpeculationAccept: false,
      inputMode: 'prompt',
      userType: 'ant',
      expandedInput: '& run this',
      parseBackgroundPRShortcutInput: input => {
        seen.push(input)
        return 'run this'
      },
    })

    expect(result).toBe('run this')
    expect(seen).toEqual(['& run this'])
  })
})

describe('resolveBackgroundPRLaunchGate', () => {
  it('returns skip when prompt is absent or session is remote', () => {
    expect(
      resolveBackgroundPRLaunchGate({
        backgroundPRPrompt: null,
        isRemoteMode: false,
        pastedContents: {},
      }),
    ).toBe('skip')

    expect(
      resolveBackgroundPRLaunchGate({
        backgroundPRPrompt: 'run',
        isRemoteMode: true,
        pastedContents: {},
      }),
    ).toBe('skip')
  })

  it('returns empty_prompt and images_unsupported guard states', () => {
    expect(
      resolveBackgroundPRLaunchGate({
        backgroundPRPrompt: '',
        isRemoteMode: false,
        pastedContents: {},
      }),
    ).toBe('empty_prompt')

    expect(
      resolveBackgroundPRLaunchGate({
        backgroundPRPrompt: 'run',
        isRemoteMode: false,
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
    ).toBe('images_unsupported')
  })

  it('returns launch when all checks pass', () => {
    expect(
      resolveBackgroundPRLaunchGate({
        backgroundPRPrompt: 'run',
        isRemoteMode: false,
        pastedContents: {},
      }),
    ).toBe('launch')
  })
})

describe('resolveImmediateLocalJsxPreflight', () => {
  it('only enables local-jsx immediate execution for slash submissions', () => {
    const command = createCommand({ immediate: true, type: 'local-jsx' })

    expect(
      resolveImmediateLocalJsxPreflight({
        hasSpeculationAccept: false,
        input: '/config',
        expandedInput: '/config',
        queryGuardActive: true,
        fromKeybinding: false,
        matchingCommand: command,
      }),
    ).toEqual({
      shouldEnterSlashPreflight: true,
      shouldTreatAsImmediate: true,
      shouldExecuteLocalJsxImmediate: true,
      commandArgs: '',
    })

    expect(
      resolveImmediateLocalJsxPreflight({
        hasSpeculationAccept: false,
        input: 'hello',
        expandedInput: 'hello',
        queryGuardActive: true,
        fromKeybinding: true,
        matchingCommand: command,
      }).shouldExecuteLocalJsxImmediate,
    ).toBe(false)
  })

  it('respects query guard, keybinding override, and command type', () => {
    const localJsx = createCommand({ immediate: false, type: 'local-jsx' })
    const promptCommand = createCommand({ immediate: true, type: 'prompt' })

    expect(
      resolveImmediateLocalJsxPreflight({
        hasSpeculationAccept: false,
        input: '/config foo',
        expandedInput: '/config foo',
        queryGuardActive: false,
        fromKeybinding: true,
        matchingCommand: localJsx,
      }),
    ).toMatchObject({
      shouldTreatAsImmediate: false,
      shouldExecuteLocalJsxImmediate: false,
      commandArgs: 'foo',
    })

    expect(
      resolveImmediateLocalJsxPreflight({
        hasSpeculationAccept: false,
        input: '/plan foo',
        expandedInput: '/plan foo',
        queryGuardActive: true,
        fromKeybinding: false,
        matchingCommand: promptCommand,
      }).shouldExecuteLocalJsxImmediate,
    ).toBe(false)
  })
})

describe('resolveIdleReturnDialogPreflight', () => {
  it('opens the dialog only when all idle-return guards pass', () => {
    const result = resolveIdleReturnDialogPreflight({
      willowMode: 'dialog',
      idleReturnDismissed: false,
      skipIdleCheck: false,
      hasSpeculationAccept: false,
      input: 'run this',
      lastQueryCompletionTimeMs: 1000,
      totalInputTokens: 200000,
      tokenThreshold: 100000,
      idleThresholdMinutes: 75,
      nowMs: 1000 + 76 * 60_000,
    })

    expect(result.shouldOpenDialog).toBe(true)
    expect(result.idleMinutes).toBeGreaterThanOrEqual(76)
  })

  it('keeps dialog closed when any gate fails', () => {
    expect(
      resolveIdleReturnDialogPreflight({
        willowMode: 'off',
        idleReturnDismissed: false,
        skipIdleCheck: false,
        hasSpeculationAccept: false,
        input: 'run this',
        lastQueryCompletionTimeMs: 1000,
        totalInputTokens: 200000,
        tokenThreshold: 100000,
        idleThresholdMinutes: 75,
        nowMs: 1000 + 76 * 60_000,
      }).shouldOpenDialog,
    ).toBe(false)

    expect(
      resolveIdleReturnDialogPreflight({
        willowMode: 'dialog',
        idleReturnDismissed: false,
        skipIdleCheck: false,
        hasSpeculationAccept: false,
        input: '/help',
        lastQueryCompletionTimeMs: 1000,
        totalInputTokens: 200000,
        tokenThreshold: 100000,
        idleThresholdMinutes: 75,
        nowMs: 1000 + 76 * 60_000,
      }).shouldOpenDialog,
    ).toBe(false)
  })
})
