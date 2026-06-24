import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const modulePath = './chromeNativeHost.ts'
const envUtilsPath = '../envUtils.js'

describe('getChromeNativeHostLogFilePath', () => {
  const originalUserType = process.env.USER_TYPE

  beforeEach(() => {
    process.env.USER_TYPE = 'ant'
  })

  afterEach(() => {
    if (originalUserType === undefined) {
      delete process.env.USER_TYPE
    } else {
      process.env.USER_TYPE = originalUserType
    }
    mock.restore()
  })

  test('uses config-home aware debug path', async () => {
    const actualEnvUtils = await import(envUtilsPath)
    mock.module(envUtilsPath, () => ({
      ...actualEnvUtils,
      getClaudeConfigHomeDir: () => '/tmp/.ncode-home',
    }))

    const module = await import(modulePath)

    expect(module.getChromeNativeHostLogFilePath()).toBe(
      '/tmp/.ncode-home/debug/chrome-native-host.txt',
    )
  })

  test('is disabled for non-ant users', async () => {
    process.env.USER_TYPE = 'external'
    const module = await import(modulePath)

    expect(module.getChromeNativeHostLogFilePath()).toBeUndefined()
  })
})
