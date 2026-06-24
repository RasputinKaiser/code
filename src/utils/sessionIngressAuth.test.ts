import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { closeSync, openSync, writeFileSync } from 'fs'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildSessionIngressLease } from '../auth/runtime/leases.js'
import { resetStateForTests } from '../bootstrap/state.js'
import {
  getSessionIngressAuthHeaders,
  getSessionIngressAuthToken,
  getSessionIngressRuntimeLease,
  updateSessionIngressAuthToken,
  updateSessionIngressRuntimeAuth,
  updateSessionIngressRuntimeLease,
} from './sessionIngressAuth.js'

let tempDir = ''
let openFd: number | null = null

const envKeys = [
  'NODE_ENV',
  'CLAUDE_CODE_SESSION_ACCESS_TOKEN',
  'CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR',
  'CLAUDE_SESSION_INGRESS_TOKEN_FILE',
  'CLAUDE_CODE_ORGANIZATION_UUID',
  'CLAUDE_CODE_REMOTE',
  'NCODE_SESSION_INGRESS_LEASE_ID',
  'NCODE_SESSION_INGRESS_LEASE_KIND',
  'NCODE_SESSION_INGRESS_LEASE_STATE',
  'NCODE_SESSION_INGRESS_LEASE_EXECUTION_TARGET',
  'NCODE_SESSION_INGRESS_LEASE_PROVIDER_MODE',
  'NCODE_SESSION_INGRESS_LEASE_RENEWABLE',
  'NCODE_SESSION_INGRESS_LEASE_RENEWAL_OWNER',
  'NCODE_SESSION_INGRESS_LEASE_TOKEN_TRANSPORT',
  'NCODE_SESSION_INGRESS_LEASE_ORGANIZATION_UUID',
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
  tempDir = await mkdtemp(join(tmpdir(), 'ncode-session-ingress-auth-test-'))
})

beforeEach(() => {
  restoreEnv()
  process.env.NODE_ENV = 'test'
  delete process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN
  delete process.env.CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR
  delete process.env.CLAUDE_SESSION_INGRESS_TOKEN_FILE
  delete process.env.CLAUDE_CODE_ORGANIZATION_UUID
  delete process.env.CLAUDE_CODE_REMOTE
  delete process.env.NCODE_SESSION_INGRESS_LEASE_ID
  delete process.env.NCODE_SESSION_INGRESS_LEASE_KIND
  delete process.env.NCODE_SESSION_INGRESS_LEASE_STATE
  delete process.env.NCODE_SESSION_INGRESS_LEASE_EXECUTION_TARGET
  delete process.env.NCODE_SESSION_INGRESS_LEASE_PROVIDER_MODE
  delete process.env.NCODE_SESSION_INGRESS_LEASE_RENEWABLE
  delete process.env.NCODE_SESSION_INGRESS_LEASE_RENEWAL_OWNER
  delete process.env.NCODE_SESSION_INGRESS_LEASE_TOKEN_TRANSPORT
  delete process.env.NCODE_SESSION_INGRESS_LEASE_ORGANIZATION_UUID
  resetStateForTests()
})

afterEach(() => {
  if (openFd !== null) {
    closeSync(openFd)
    openFd = null
  }
  restoreEnv()
})

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('sessionIngressAuth', () => {
  it('prefers the explicit session access token env var over file-backed fallback state', () => {
    process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN = 'env-session-token'
    process.env.CLAUDE_SESSION_INGRESS_TOKEN_FILE = writeTokenFile(
      'fallback-token.txt',
      'fallback-token',
    )

    expect(getSessionIngressAuthToken()).toBe('env-session-token')

    updateSessionIngressAuthToken('updated-session-token')

    expect(getSessionIngressAuthToken()).toBe('updated-session-token')
    expect(getSessionIngressAuthHeaders()).toEqual({
      Authorization: 'Bearer updated-session-token',
    })
  })

  it('reads a bearer token from a real file descriptor when no env token is present', () => {
    const fdPath = writeTokenFile('fd-token.txt', 'fd-session-token')
    openFd = openSync(fdPath, 'r')
    process.env.CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR = String(openFd)

    expect(getSessionIngressAuthToken()).toBe('fd-session-token')
    expect(getSessionIngressAuthHeaders()).toEqual({
      Authorization: 'Bearer fd-session-token',
    })
  })

  it('falls back to the well-known token file when the file descriptor read fails', () => {
    process.env.CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR = '999999'
    process.env.CLAUDE_SESSION_INGRESS_TOKEN_FILE = writeTokenFile(
      'fallback-after-fd-failure.txt',
      'file-fallback-token',
    )

    expect(getSessionIngressAuthToken()).toBe('file-fallback-token')
    expect(getSessionIngressAuthHeaders()).toEqual({
      Authorization: 'Bearer file-fallback-token',
    })
  })

  it('uses cookie auth for session keys and forwards the organization uuid', () => {
    process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN = 'sk-ant-sid-session-key'
    process.env.CLAUDE_CODE_ORGANIZATION_UUID = 'org-123'

    expect(getSessionIngressAuthHeaders()).toEqual({
      Cookie: 'sessionKey=sk-ant-sid-session-key',
      'X-Organization-Uuid': 'org-123',
    })
  })

  it('prefers explicit lease metadata when building session-ingress auth headers', () => {
    process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN = 'opaque-session-token'
    process.env.NCODE_SESSION_INGRESS_LEASE_ID =
      'session_ingress:cse_123:cookie'
    process.env.NCODE_SESSION_INGRESS_LEASE_KIND = 'session_ingress'
    process.env.NCODE_SESSION_INGRESS_LEASE_STATE = 'usable'
    process.env.NCODE_SESSION_INGRESS_LEASE_EXECUTION_TARGET = 'remote'
    process.env.NCODE_SESSION_INGRESS_LEASE_PROVIDER_MODE = 'noumena_managed'
    process.env.NCODE_SESSION_INGRESS_LEASE_RENEWABLE = '1'
    process.env.NCODE_SESSION_INGRESS_LEASE_RENEWAL_OWNER = 'session_runtime'
    process.env.NCODE_SESSION_INGRESS_LEASE_TOKEN_TRANSPORT = 'cookie'
    process.env.NCODE_SESSION_INGRESS_LEASE_ORGANIZATION_UUID = 'org-lease'

    expect(getSessionIngressRuntimeLease()).toMatchObject({
      leaseKind: 'session_ingress',
      leaseId: 'session_ingress:cse_123:cookie',
      sessionId: 'cse_123',
      renewable: true,
      renewalOwner: 'session_runtime',
      organizationUuid: 'org-lease',
      metadata: {
        tokenTransport: 'cookie',
      },
    })
    expect(getSessionIngressAuthHeaders()).toEqual({
      Cookie: 'sessionKey=opaque-session-token',
      'X-Organization-Uuid': 'org-lease',
    })
  })

  it('can update the runtime lease env explicitly for in-process bridge sessions', () => {
    process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN = 'sk-ant-sid-updated'

    updateSessionIngressRuntimeLease(
      buildSessionIngressLease({
        executionTarget: 'remote',
        organizationUuid: 'org-lease',
        sessionId: 'cse_456',
        token: 'sk-ant-sid-updated',
      }),
    )

    expect(process.env.NCODE_SESSION_INGRESS_LEASE_ID).toBe(
      'session_ingress:cse_456:cookie',
    )
    expect(process.env.NCODE_SESSION_INGRESS_LEASE_TOKEN_TRANSPORT).toBe(
      'cookie',
    )
    expect(getSessionIngressRuntimeLease()).toMatchObject({
      sessionId: 'cse_456',
      organizationUuid: 'org-lease',
      metadata: {
        tokenTransport: 'cookie',
      },
    })
  })

  it('can update token and lease metadata together for bridge runtime refreshes', () => {
    updateSessionIngressRuntimeAuth({
      executionTarget: 'remote',
      organizationUuid: 'org-combined',
      sessionId: 'cse_combined',
      token: 'jwt-combined-token',
    })

    expect(process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN).toBe(
      'jwt-combined-token',
    )
    expect(getSessionIngressRuntimeLease()).toMatchObject({
      leaseId: 'session_ingress:cse_combined:bearer',
      sessionId: 'cse_combined',
      organizationUuid: 'org-combined',
      metadata: {
        tokenTransport: 'bearer',
      },
    })
    expect(getSessionIngressAuthHeaders()).toEqual({
      Authorization: 'Bearer jwt-combined-token',
    })
  })
})
