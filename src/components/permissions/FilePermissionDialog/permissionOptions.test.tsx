import { describe, expect, test } from 'bun:test'
import { getOriginalCwd } from '../../../bootstrap/state.js'
import type { ToolPermissionContext } from '../../../Tool.js'
import {
  getFilePermissionOptions,
  isInClaudeFolder,
  isInGlobalClaudeFolder,
} from './permissionOptions.js'

const toolPermissionContext = {
  additionalWorkingDirectories: new Map(),
} as ToolPermissionContext

describe('managed config folder permission options', () => {
  test('detects project canonical .ncode folder', () => {
    expect(
      isInClaudeFolder(`${getOriginalCwd()}/.ncode/settings.json`),
    ).toBe(true)
  })

  test('detects global canonical .ncode folder', () => {
    expect(isInGlobalClaudeFolder('/home/xjdr/.ncode/settings.json')).toBe(true)
  })

  test('offers the special session option for canonical .ncode settings files', () => {
    const options = getFilePermissionOptions({
      filePath: `${getOriginalCwd()}/.ncode/settings.json`,
      toolPermissionContext,
      operationType: 'write',
    })

    expect(
      options.some(
        option =>
          option.option.type === 'accept-session' &&
          option.option.scope === 'ncode-folder',
      ),
    ).toBe(true)
  })
})
