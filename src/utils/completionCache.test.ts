import { afterEach, describe, expect, mock, test } from 'bun:test'

const modulePath = './completionCache.ts'
const envUtilsPath = './envUtils.js'

describe('getCompletionCacheDir', () => {
  afterEach(() => {
    mock.restore()
  })

  test('uses config-home aware completion cache root', async () => {
    const actualEnvUtils = await import(envUtilsPath)
    mock.module(envUtilsPath, () => ({
      ...actualEnvUtils,
      getClaudeConfigHomeDir: () => '/tmp/.ncode-home',
    }))

    const module = await import(modulePath)

    expect(module.getCompletionCacheDir()).toBe('/tmp/.ncode-home')
  })
})
