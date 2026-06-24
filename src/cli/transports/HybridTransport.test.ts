import axios from 'axios'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { HybridTransport } from './HybridTransport.js'

const originalAxiosPost = axios.post
const originalSessionIngressToken =
  process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN
const originalSessionIngressLeaseId = process.env.NCODE_SESSION_INGRESS_LEASE_ID
const originalSessionIngressLeaseKind =
  process.env.NCODE_SESSION_INGRESS_LEASE_KIND
const originalSessionIngressLeaseState =
  process.env.NCODE_SESSION_INGRESS_LEASE_STATE
const originalSessionIngressLeaseExecutionTarget =
  process.env.NCODE_SESSION_INGRESS_LEASE_EXECUTION_TARGET
const originalSessionIngressLeaseProviderMode =
  process.env.NCODE_SESSION_INGRESS_LEASE_PROVIDER_MODE
const originalSessionIngressLeaseRenewable =
  process.env.NCODE_SESSION_INGRESS_LEASE_RENEWABLE
const originalSessionIngressLeaseRenewalOwner =
  process.env.NCODE_SESSION_INGRESS_LEASE_RENEWAL_OWNER
const originalSessionIngressLeaseTokenTransport =
  process.env.NCODE_SESSION_INGRESS_LEASE_TOKEN_TRANSPORT
const originalSessionIngressLeaseOrganizationUuid =
  process.env.NCODE_SESSION_INGRESS_LEASE_ORGANIZATION_UUID

const postCalls: Array<{
  url: string
  body: unknown
  options?: unknown
}> = []

function restoreEnvVar(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

beforeEach(() => {
  postCalls.length = 0
  delete process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN
  delete process.env.NCODE_SESSION_INGRESS_LEASE_ID
  delete process.env.NCODE_SESSION_INGRESS_LEASE_KIND
  delete process.env.NCODE_SESSION_INGRESS_LEASE_STATE
  delete process.env.NCODE_SESSION_INGRESS_LEASE_EXECUTION_TARGET
  delete process.env.NCODE_SESSION_INGRESS_LEASE_PROVIDER_MODE
  delete process.env.NCODE_SESSION_INGRESS_LEASE_RENEWABLE
  delete process.env.NCODE_SESSION_INGRESS_LEASE_RENEWAL_OWNER
  delete process.env.NCODE_SESSION_INGRESS_LEASE_TOKEN_TRANSPORT
  delete process.env.NCODE_SESSION_INGRESS_LEASE_ORGANIZATION_UUID

  axios.post = (async (url: string, body: unknown, options?: unknown) => {
    postCalls.push({ url, body, options })
    return {
      status: 200,
      data: {},
    } as never
  }) as typeof axios.post
})

afterEach(() => {
  restoreEnvVar('CLAUDE_CODE_SESSION_ACCESS_TOKEN', originalSessionIngressToken)
  restoreEnvVar('NCODE_SESSION_INGRESS_LEASE_ID', originalSessionIngressLeaseId)
  restoreEnvVar(
    'NCODE_SESSION_INGRESS_LEASE_KIND',
    originalSessionIngressLeaseKind,
  )
  restoreEnvVar(
    'NCODE_SESSION_INGRESS_LEASE_STATE',
    originalSessionIngressLeaseState,
  )
  restoreEnvVar(
    'NCODE_SESSION_INGRESS_LEASE_EXECUTION_TARGET',
    originalSessionIngressLeaseExecutionTarget,
  )
  restoreEnvVar(
    'NCODE_SESSION_INGRESS_LEASE_PROVIDER_MODE',
    originalSessionIngressLeaseProviderMode,
  )
  restoreEnvVar(
    'NCODE_SESSION_INGRESS_LEASE_RENEWABLE',
    originalSessionIngressLeaseRenewable,
  )
  restoreEnvVar(
    'NCODE_SESSION_INGRESS_LEASE_RENEWAL_OWNER',
    originalSessionIngressLeaseRenewalOwner,
  )
  restoreEnvVar(
    'NCODE_SESSION_INGRESS_LEASE_TOKEN_TRANSPORT',
    originalSessionIngressLeaseTokenTransport,
  )
  restoreEnvVar(
    'NCODE_SESSION_INGRESS_LEASE_ORGANIZATION_UUID',
    originalSessionIngressLeaseOrganizationUuid,
  )
  axios.post = originalAxiosPost
})

describe('HybridTransport auth headers', () => {
  it('uses cookie-based session-ingress headers for POST writes when the lease transport is cookie', async () => {
    process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN = 'sk-ant-sid-cookie-token'
    process.env.NCODE_SESSION_INGRESS_LEASE_ID =
      'session_ingress:session-1:cookie'
    process.env.NCODE_SESSION_INGRESS_LEASE_KIND = 'session_ingress'
    process.env.NCODE_SESSION_INGRESS_LEASE_STATE = 'usable'
    process.env.NCODE_SESSION_INGRESS_LEASE_EXECUTION_TARGET = 'remote'
    process.env.NCODE_SESSION_INGRESS_LEASE_PROVIDER_MODE = 'noumena_managed'
    process.env.NCODE_SESSION_INGRESS_LEASE_RENEWABLE = '1'
    process.env.NCODE_SESSION_INGRESS_LEASE_RENEWAL_OWNER = 'session_runtime'
    process.env.NCODE_SESSION_INGRESS_LEASE_TOKEN_TRANSPORT = 'cookie'
    process.env.NCODE_SESSION_INGRESS_LEASE_ORGANIZATION_UUID = 'org-cookie'

    const transport = new HybridTransport(
      new URL('wss://api.dev.noumena.test/v1/session_ingress/ws/session-1'),
    )

    await (transport as any).postOnce([{ type: 'keep_alive' }])

    expect(postCalls).toHaveLength(1)
    expect(
      (
        postCalls[0]!.options as {
          headers: Record<string, string>
        }
      ).headers,
    ).toEqual({
      Cookie: 'sessionKey=sk-ant-sid-cookie-token',
      'X-Organization-Uuid': 'org-cookie',
      'Content-Type': 'application/json',
    })

    transport.close()
  })
})
