import axios from 'axios'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  getOauthProfileFromApiKey,
  getOauthProfileFromOauthToken,
} from './getOauthProfile.js'
import { getGlobalConfig, saveGlobalConfig } from 'src/utils/config.js'
import {
  _resetErrorLogForTesting,
  getInMemoryErrors,
} from 'src/utils/log.js'

let apiKeyProfileResult: unknown = { account: { uuid: 'acct-1' } }
let oauthProfileResult: unknown = { organization: { uuid: 'org-1' } }
let apiKeyShouldThrow = false
let oauthShouldThrow = false
let apiKeyCalls: Array<unknown> = []
let oauthCalls: Array<unknown> = []

const originalAxiosGet = axios.get
const originalNoumenaApiKey = process.env.NOUMENA_API_KEY
const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY
const originalOauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN
const originalNoumenaPlatformBaseUrl = process.env.NOUMENA_PLATFORM_BASE_URL
const originalOauthAccount = getGlobalConfig().oauthAccount

function restoreEnvVar(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

function setOauthAccount(accountUuid: string | undefined): void {
  saveGlobalConfig(current => ({
    ...current,
    oauthAccount: accountUuid
      ? {
          ...(current.oauthAccount ?? {}),
          accountUuid,
        }
      : undefined,
  }))
}

beforeEach(() => {
  apiKeyProfileResult = { account: { uuid: 'acct-1' } }
  oauthProfileResult = { organization: { uuid: 'org-1' } }
  apiKeyShouldThrow = false
  oauthShouldThrow = false
  apiKeyCalls = []
  oauthCalls = []

  restoreEnvVar('ANTHROPIC_API_KEY', originalAnthropicApiKey)
  restoreEnvVar('NOUMENA_API_KEY', originalNoumenaApiKey)
  restoreEnvVar('CLAUDE_CODE_OAUTH_TOKEN', originalOauthToken)
  process.env.NOUMENA_PLATFORM_BASE_URL = 'https://api.noumena.test'
  setOauthAccount('acct-1')
  _resetErrorLogForTesting()

  axios.get = (async (url: string, ...rest: unknown[]) => {
    if (url.endsWith('/api/claude_cli_profile')) {
      apiKeyCalls.push(rest[0])
      if (apiKeyShouldThrow) {
        throw new Error('api-key-profile boom')
      }
      return { data: apiKeyProfileResult }
    }

    if (url.endsWith('/api/oauth/profile')) {
      oauthCalls.push(rest[0])
      if (oauthShouldThrow) {
        throw new Error('oauth-profile boom')
      }
      return { data: oauthProfileResult }
    }

    throw new Error(`Unexpected axios.get URL in getOauthProfile test: ${url}`)
  }) as typeof axios.get
})

afterEach(() => {
  axios.get = originalAxiosGet
  restoreEnvVar('ANTHROPIC_API_KEY', originalAnthropicApiKey)
  restoreEnvVar('NOUMENA_API_KEY', originalNoumenaApiKey)
  restoreEnvVar('CLAUDE_CODE_OAUTH_TOKEN', originalOauthToken)
  restoreEnvVar('NOUMENA_PLATFORM_BASE_URL', originalNoumenaPlatformBaseUrl)
  saveGlobalConfig(current => ({
    ...current,
    oauthAccount: originalOauthAccount,
  }))
  _resetErrorLogForTesting()
})

describe('oauth profile helpers', () => {
  it('returns undefined without both account UUID and API key', async () => {
    delete process.env.ANTHROPIC_API_KEY
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'oauth-token'

    expect(await getOauthProfileFromApiKey()).toBeUndefined()
    expect(apiKeyCalls).toEqual([])
  })

  it('delegates the api-key profile request with the expected beta header and timeout', async () => {
    process.env.ANTHROPIC_API_KEY = 'api-key'

    expect(await getOauthProfileFromApiKey()).toEqual({
      account: { uuid: 'acct-1' },
    })
    expect(apiKeyCalls).toEqual([
      {
        headers: {
          'x-api-key': 'api-key',
          'anthropic-beta': 'oauth-2025-04-20',
        },
        params: {
          account_uuid: 'acct-1',
        },
        timeout: 10000,
      },
    ])
  })

  it('uses canonical direct NOUMENA_API_KEY sessions for the api-key profile request', async () => {
    delete process.env.ANTHROPIC_API_KEY
    process.env.NOUMENA_API_KEY = 'noumena-api-key'

    expect(await getOauthProfileFromApiKey()).toEqual({
      account: { uuid: 'acct-1' },
    })
    expect(apiKeyCalls).toEqual([
      {
        headers: {
          'x-api-key': 'noumena-api-key',
          'anthropic-beta': 'oauth-2025-04-20',
        },
        params: {
          account_uuid: 'acct-1',
        },
        timeout: 10000,
      },
    ])
  })

  it('delegates the oauth-token profile request with the expected timeout', async () => {
    expect(await getOauthProfileFromOauthToken('oauth-token')).toEqual({
      organization: { uuid: 'org-1' },
    })
    expect(oauthCalls).toEqual([
      {
        headers: {
          Authorization: 'Bearer oauth-token',
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      },
    ])
  })

  it('logs and swallows profile lookup errors', async () => {
    oauthShouldThrow = true

    expect(await getOauthProfileFromOauthToken('oauth-token')).toBeUndefined()
    expect(getInMemoryErrors()).toHaveLength(1)
    expect(getInMemoryErrors()[0]?.error).toContain('oauth-profile boom')
  })
})
