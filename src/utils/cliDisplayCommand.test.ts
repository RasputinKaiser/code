import { afterEach, describe, expect, test } from 'bun:test'
import {
  getCliDisplayCommand,
  getTeleportResumeCommand,
} from './cliDisplayCommand.js'

const ORIGINAL_NCODE_CLI_DISPLAY_COMMAND =
  process.env.NCODE_CLI_DISPLAY_COMMAND
const ORIGINAL_NCODE_BUILD_MODE = process.env.NCODE_BUILD_MODE

afterEach(() => {
  if (ORIGINAL_NCODE_CLI_DISPLAY_COMMAND === undefined) {
    delete process.env.NCODE_CLI_DISPLAY_COMMAND
  } else {
    process.env.NCODE_CLI_DISPLAY_COMMAND =
      ORIGINAL_NCODE_CLI_DISPLAY_COMMAND
  }

  if (ORIGINAL_NCODE_BUILD_MODE === undefined) {
    delete process.env.NCODE_BUILD_MODE
  } else {
    process.env.NCODE_BUILD_MODE = ORIGINAL_NCODE_BUILD_MODE
  }
})

describe('getCliDisplayCommand', () => {
  test('prefers explicit wrapper command', () => {
    process.env.NCODE_CLI_DISPLAY_COMMAND =
      '../ncode/code/ncode-staging-self-contained'
    process.env.NCODE_BUILD_MODE = 'noumena'

    expect(getCliDisplayCommand()).toBe(
      '../ncode/code/ncode-staging-self-contained',
    )
    expect(getTeleportResumeCommand('abc123')).toBe(
      '../ncode/code/ncode-staging-self-contained --teleport abc123',
    )
  })

  test('falls back to code for noumena builds', () => {
    delete process.env.NCODE_CLI_DISPLAY_COMMAND
    process.env.NCODE_BUILD_MODE = 'noumena'

    expect(getCliDisplayCommand()).toBe('code')
  })

  test('falls back to claude for non-noumena builds', () => {
    delete process.env.NCODE_CLI_DISPLAY_COMMAND
    delete process.env.NCODE_BUILD_MODE

    expect(getCliDisplayCommand()).toBe('claude')
  })
})
