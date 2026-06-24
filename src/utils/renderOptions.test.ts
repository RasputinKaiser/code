import { afterEach, describe, expect, test } from 'bun:test'
import { getBaseRenderOptions, resetRenderOptionsForTesting } from './renderOptions.js'

const ORIGINAL_DISABLE = process.env.NCODE_DISABLE_STDIN_TTY_OVERRIDE
const ORIGINAL_LEGACY_DISABLE = process.env.CLAUDE_CODE_DISABLE_STDIN_TTY_OVERRIDE

afterEach(() => {
  if (ORIGINAL_DISABLE === undefined) {
    delete process.env.NCODE_DISABLE_STDIN_TTY_OVERRIDE
  } else {
    process.env.NCODE_DISABLE_STDIN_TTY_OVERRIDE = ORIGINAL_DISABLE
  }

  if (ORIGINAL_LEGACY_DISABLE === undefined) {
    delete process.env.CLAUDE_CODE_DISABLE_STDIN_TTY_OVERRIDE
  } else {
    process.env.CLAUDE_CODE_DISABLE_STDIN_TTY_OVERRIDE = ORIGINAL_LEGACY_DISABLE
  }

  resetRenderOptionsForTesting()
})

describe('getBaseRenderOptions', () => {
  test('can disable /dev/tty stdin override for PTY harnessed runtimes', () => {
    process.env.NCODE_DISABLE_STDIN_TTY_OVERRIDE = '1'
    resetRenderOptionsForTesting()

    const options = getBaseRenderOptions(false)

    expect(options.stdin).toBeUndefined()
    expect(options.exitOnCtrlC).toBe(false)
  })
})
