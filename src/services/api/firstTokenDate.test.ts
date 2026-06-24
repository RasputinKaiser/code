import axios from 'axios'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { fetchAndStoreClaudeCodeFirstTokenDate } from './firstTokenDate.js'
import { clearOAuthTokenCache } from '../../utils/auth.js'
import {
  _setGlobalConfigCacheForTesting,
  enableConfigs,
  getGlobalConfig,
  saveGlobalConfig,
} from '../../utils/config.js'
import {
  _resetErrorLogForTesting,
  getInMemoryErrors,
} from '../../utils/log.js'

let tempConfigDir = ''
let responseData: unknown = undefined
let responseError: Error | undefined
const getCalls: Array<{ url: string; options?: unknown }> = []

const originalAxiosGet = axios.get
const originalMacro = (globalThis as { MACRO?: unknown }).MACRO
const envKeys = [
  'NODE_ENV',
  'CI',
  'CLAUDE_CONFIG_DIR',
  'NOUMENA_PLATFORM_BASE_URL',
  'ANTHROPIC_API_KEY',
  'NOUMENA_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'NCODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
  'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
  'CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR',
] as const
const originalEnv = Object.fromEntries(
  envKeys.map(key => [key, process.env[key]]),
) as Record<(typeof envKeys)[number], string | undefined>

function restoreEnvVar(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

function restoreEnv(): void {
  for (const key of envKeys) {
    restoreEnvVar(key, originalEnv[key])
  }
}

function setStableTestRuntime(): void {
  process.env.NODE_ENV = 'test'
  delete process.env.CI
  process.env.CLAUDE_CONFIG_DIR = tempConfigDir
  process.env.NOUMENA_PLATFORM_BASE_URL = 'https://api.noumena.test'
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.NOUMENA_API_KEY
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN
  delete process.env.NCODE_OAUTH_TOKEN_FILE_DESCRIPTOR
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR
  delete process.env.CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR

  ;(globalThis as { MACRO?: Record<string, unknown> }).MACRO = {
    ...(typeof originalMacro === 'object' && originalMacro !== null
      ? (originalMacro as Record<string, unknown>)
      : {}),
    VERSION: 'test-version',
  }
}

function resetFirstTokenDateConfig(): void {
  saveGlobalConfig(current => ({
    ...current,
    claudeCodeFirstTokenDate: undefined,
  }))
}

beforeAll(async () => {
  tempConfigDir = await mkdtemp(join(tmpdir(), 'ncode-first-token-date-'))
})

beforeEach(() => {
  restoreEnv()
  setStableTestRuntime()
  enableConfigs()
  clearOAuthTokenCache()
  _resetErrorLogForTesting()
  resetFirstTokenDateConfig()
  getCalls.length = 0
  responseData = undefined
  responseError = undefined

  axios.get = (async (url: string, options?: unknown) => {
    getCalls.push({ url, options })
    if (responseError) {
      throw responseError
    }
    return { data: responseData }
  }) as typeof axios.get
})

afterEach(() => {
  axios.get = originalAxiosGet
  clearOAuthTokenCache()
  _resetErrorLogForTesting()
  _setGlobalConfigCacheForTesting(null)
  restoreEnv()
  ;(globalThis as { MACRO?: unknown }).MACRO = originalMacro
})

afterAll(async () => {
  await rm(tempConfigDir, { recursive: true, force: true })
})

describe('fetchAndStoreClaudeCodeFirstTokenDate', () => {
  it('returns early without fetching when the first-token date is already cached', async () => {
    saveGlobalConfig(current => ({
      ...current,
      claudeCodeFirstTokenDate: '2025-01-02T00:00:00.000Z',
    }))

    await fetchAndStoreClaudeCodeFirstTokenDate()

    expect(getCalls).toEqual([])
    expect(getGlobalConfig().claudeCodeFirstTokenDate).toBe(
      '2025-01-02T00:00:00.000Z',
    )
    expect(getInMemoryErrors()).toEqual([])
  })

  it('fetches and stores the date with api-key auth and the NCode user agent', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    responseData = {
      first_token_date: '2026-01-02T00:00:00.000Z',
    }

    await fetchAndStoreClaudeCodeFirstTokenDate()

    expect(getCalls).toEqual([
      {
        url: 'https://api.noumena.test/api/organization/claude_code_first_token_date',
        options: {
          headers: {
            'x-api-key': 'sk-test',
            'User-Agent': 'ncode/test-version',
          },
          timeout: 10000,
        },
      },
    ])
    expect(getGlobalConfig().claudeCodeFirstTokenDate).toBe(
      '2026-01-02T00:00:00.000Z',
    )
    expect(getInMemoryErrors()).toEqual([])
  })

  it('logs and skips persistence when auth headers are unavailable', async () => {
    await fetchAndStoreClaudeCodeFirstTokenDate()

    expect(getCalls).toEqual([])
    expect(getGlobalConfig().claudeCodeFirstTokenDate).toBeUndefined()
    expect(getInMemoryErrors()).toHaveLength(1)
    expect(getInMemoryErrors()[0]!.error).toContain('ANTHROPIC_API_KEY')
  })

  it('rejects invalid API dates and leaves the cached value unset', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    responseData = {
      first_token_date: 'not-a-date',
    }

    await fetchAndStoreClaudeCodeFirstTokenDate()

    expect(getCalls).toHaveLength(1)
    expect(getGlobalConfig().claudeCodeFirstTokenDate).toBeUndefined()
    expect(getInMemoryErrors()).toHaveLength(1)
    expect(getInMemoryErrors()[0]!.error).toContain(
      'Received invalid first_token_date from API: not-a-date',
    )
  })
})
