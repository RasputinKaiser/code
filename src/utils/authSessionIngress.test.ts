import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test'
import { writeFileSync } from 'fs'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { resetStateForTests } from '../bootstrap/state.js'
import {
  getAuthTokenSource,
  getClaudeAIOAuthTokens,
  isAnthropicAuthEnabled,
} from './auth.js'

let tempDir = ''

const envKeys = [
  'NODE_ENV',
  'CI',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_SESSION_ACCESS_TOKEN',
  'CLAUDE_SESSION_INGRESS_TOKEN_FILE',
  'CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR',
  'NCODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
  'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
  'CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR',
  'CLAUDE_CODE_REMOTE',
  'CLAUDE_CODE_ENTRYPOINT',
  'ANTHROPIC_UNIX_SOCKET',
  'ANTHROPIC_AUTH_TOKEN',
  'NOUMENA_API_KEY',
  'ANTHROPIC_API_KEY',
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

function writeTokenFile(name: string, token: string): string {
  const path = join(tempDir, name)
  writeFileSync(path, token, 'utf8')
  return path
}

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'ncode-auth-session-token-test-'))
})

beforeEach(() => {
  restoreEnv()
  process.env.NODE_ENV = 'test'
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN
  delete process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN
  delete process.env.CLAUDE_SESSION_INGRESS_TOKEN_FILE
  delete process.env.CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR
  delete process.env.NCODE_OAUTH_TOKEN_FILE_DESCRIPTOR
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR
  delete process.env.CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR
  delete process.env.CLAUDE_CODE_REMOTE
  delete process.env.CLAUDE_CODE_ENTRYPOINT
  delete process.env.ANTHROPIC_UNIX_SOCKET
  delete process.env.ANTHROPIC_AUTH_TOKEN
  delete process.env.NOUMENA_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  resetStateForTests()
  getClaudeAIOAuthTokens.cache?.clear?.()
})

afterEach(() => {
  resetStateForTests()
  restoreEnv()
  getClaudeAIOAuthTokens.cache?.clear?.()
})

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('session ingress token auth integration', () => {
  it('treats an explicit session access token as valid first-party auth', () => {
    process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN = 'session-env-token'

    expect(isAnthropicAuthEnabled()).toBe(true)
    expect(getAuthTokenSource()).toEqual({
      source: 'CLAUDE_CODE_SESSION_ACCESS_TOKEN',
      hasToken: true,
    })
    expect(getClaudeAIOAuthTokens()).toMatchObject({
      accessToken: 'session-env-token',
      refreshToken: null,
      expiresAt: null,
      scopes: ['user:inference'],
    })
  })

  it('treats a file-backed session ingress token as valid first-party auth', () => {
    process.env.CLAUDE_SESSION_INGRESS_TOKEN_FILE = writeTokenFile(
      'session-token.txt',
      'session-file-token',
    )

    expect(isAnthropicAuthEnabled()).toBe(true)
    expect(getAuthTokenSource()).toEqual({
      source: 'CLAUDE_SESSION_INGRESS_TOKEN_FILE',
      hasToken: true,
    })
    expect(getClaudeAIOAuthTokens()).toMatchObject({
      accessToken: 'session-file-token',
      refreshToken: null,
      expiresAt: null,
      scopes: ['user:inference'],
    })
  })
})
