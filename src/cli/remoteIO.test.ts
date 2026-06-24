import axios from 'axios'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { fromArray } from 'src/utils/generators.js'

import {
  buildHistoricalSessionEventsUrl,
  fetchHistoricalSessionEvents,
  RemoteIO,
} from './remoteIO.js'

type GetResponse = {
  status: number
  data: unknown
}

const originalAxiosGet = axios.get
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

let getResponses: GetResponse[] = []
const getCalls: Array<{
  url: string
  options?: unknown
}> = []

beforeEach(() => {
  getResponses = []
  getCalls.length = 0
  process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN = 'test-session-token'
  delete process.env.NCODE_SESSION_INGRESS_LEASE_ID
  delete process.env.NCODE_SESSION_INGRESS_LEASE_KIND
  delete process.env.NCODE_SESSION_INGRESS_LEASE_STATE
  delete process.env.NCODE_SESSION_INGRESS_LEASE_EXECUTION_TARGET
  delete process.env.NCODE_SESSION_INGRESS_LEASE_PROVIDER_MODE
  delete process.env.NCODE_SESSION_INGRESS_LEASE_RENEWABLE
  delete process.env.NCODE_SESSION_INGRESS_LEASE_RENEWAL_OWNER
  delete process.env.NCODE_SESSION_INGRESS_LEASE_TOKEN_TRANSPORT
  delete process.env.NCODE_SESSION_INGRESS_LEASE_ORGANIZATION_UUID
  axios.get = (async (url: string, options?: unknown) => {
    getCalls.push({ url, options })
    const next = getResponses.shift()
    if (!next) {
      throw new Error('Unexpected axios.get call')
    }
    return next as never
  }) as typeof axios.get
})

afterEach(() => {
  if (originalSessionIngressToken === undefined) {
    delete process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN
  } else {
    process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN = originalSessionIngressToken
  }
  if (originalSessionIngressLeaseId === undefined) {
    delete process.env.NCODE_SESSION_INGRESS_LEASE_ID
  } else {
    process.env.NCODE_SESSION_INGRESS_LEASE_ID = originalSessionIngressLeaseId
  }
  if (originalSessionIngressLeaseKind === undefined) {
    delete process.env.NCODE_SESSION_INGRESS_LEASE_KIND
  } else {
    process.env.NCODE_SESSION_INGRESS_LEASE_KIND =
      originalSessionIngressLeaseKind
  }
  if (originalSessionIngressLeaseState === undefined) {
    delete process.env.NCODE_SESSION_INGRESS_LEASE_STATE
  } else {
    process.env.NCODE_SESSION_INGRESS_LEASE_STATE =
      originalSessionIngressLeaseState
  }
  if (originalSessionIngressLeaseExecutionTarget === undefined) {
    delete process.env.NCODE_SESSION_INGRESS_LEASE_EXECUTION_TARGET
  } else {
    process.env.NCODE_SESSION_INGRESS_LEASE_EXECUTION_TARGET =
      originalSessionIngressLeaseExecutionTarget
  }
  if (originalSessionIngressLeaseProviderMode === undefined) {
    delete process.env.NCODE_SESSION_INGRESS_LEASE_PROVIDER_MODE
  } else {
    process.env.NCODE_SESSION_INGRESS_LEASE_PROVIDER_MODE =
      originalSessionIngressLeaseProviderMode
  }
  if (originalSessionIngressLeaseRenewable === undefined) {
    delete process.env.NCODE_SESSION_INGRESS_LEASE_RENEWABLE
  } else {
    process.env.NCODE_SESSION_INGRESS_LEASE_RENEWABLE =
      originalSessionIngressLeaseRenewable
  }
  if (originalSessionIngressLeaseRenewalOwner === undefined) {
    delete process.env.NCODE_SESSION_INGRESS_LEASE_RENEWAL_OWNER
  } else {
    process.env.NCODE_SESSION_INGRESS_LEASE_RENEWAL_OWNER =
      originalSessionIngressLeaseRenewalOwner
  }
  if (originalSessionIngressLeaseTokenTransport === undefined) {
    delete process.env.NCODE_SESSION_INGRESS_LEASE_TOKEN_TRANSPORT
  } else {
    process.env.NCODE_SESSION_INGRESS_LEASE_TOKEN_TRANSPORT =
      originalSessionIngressLeaseTokenTransport
  }
  if (originalSessionIngressLeaseOrganizationUuid === undefined) {
    delete process.env.NCODE_SESSION_INGRESS_LEASE_ORGANIZATION_UUID
  } else {
    process.env.NCODE_SESSION_INGRESS_LEASE_ORGANIZATION_UUID =
      originalSessionIngressLeaseOrganizationUuid
  }
  axios.get = originalAxiosGet
})

describe('remoteIO historical session replay', () => {
  it('hydrates historical events even when an empty stdin async iterable is present', async () => {
    getResponses.push({
      status: 200,
      data: {
        data: [
          {
            type: 'user',
            session_id: 'session-1',
            message: { role: 'user', content: 'Reply with REMOTE_OK.' },
          },
        ],
        has_more: false,
        last_id: 'evt-1',
      },
    })

    const remote = new RemoteIO(
      'wss://api.dev.noumena.test/v1/session_ingress/ws/session-1',
      fromArray([]),
      true,
      'session-1',
    )

    await Bun.sleep(0)

    expect(getCalls).toHaveLength(1)
    expect(getCalls[0]?.url).toBe(
      'https://api.dev.noumena.test/v1/sessions/session-1/events',
    )

    remote.close()
  })

  it('prefers an explicit session id override for historical replay targeting', () => {
    const remote = new RemoteIO(
      'wss://example.test/v1/session_ingress/ws/server-session',
      undefined,
      false,
      'client-session-override',
    ) as unknown as { sessionId?: string; close(): void }

    expect(remote.sessionId).toBe('client-session-override')
    remote.close()
  })

  it('uses explicit cookie-based session-ingress headers for historical replay', async () => {
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

    getResponses.push({
      status: 200,
      data: {
        data: [],
        has_more: false,
        last_id: 'evt-1',
      },
    })

    const remote = new RemoteIO(
      'wss://api.dev.noumena.test/v1/session_ingress/ws/session-1',
      fromArray([]),
      true,
      'session-1',
    )

    await Bun.sleep(0)

    expect(getCalls).toHaveLength(1)
    expect(
      (
        getCalls[0]!.options as {
          headers: Record<string, string>
        }
      ).headers,
    ).toMatchObject({
      Cookie: 'sessionKey=sk-ant-sid-cookie-token',
      'X-Organization-Uuid': 'org-cookie',
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'ccr-byoc-2025-07-29',
    })

    remote.close()
  })

  it('builds a sessions events URL from a v1 session ingress websocket URL', () => {
    expect(
      buildHistoricalSessionEventsUrl(
        new URL('wss://api.dev.noumena.test/v1/session_ingress/ws/session-1'),
        'session-1',
      ),
    ).toBe('https://api.dev.noumena.test/v1/sessions/session-1/events')

    expect(
      buildHistoricalSessionEventsUrl(
        new URL('https://api.dev.noumena.test/v1/session_ingress/session/session-1'),
        'session-1',
      ),
    ).toBeNull()
  })

  it('fetches replayable historical session events with pagination and filtering', async () => {
    getResponses.push(
      {
        status: 200,
        data: {
          data: [
            {
              type: 'user',
              session_id: 'session-1',
              message: { role: 'user', content: 'Reply with REMOTE_OK.' },
            },
            {
              type: 'worker_provisioned',
              session_id: 'session-1',
            },
            {
              type: 'control_response',
              session_id: 'session-1',
            },
          ],
          has_more: true,
          last_id: 'evt-1',
        },
      },
      {
        status: 200,
        data: {
          data: [
            {
              type: 'assistant',
              session_id: 'session-1',
              message: { role: 'assistant', content: 'REMOTE_OK' },
            },
            {
              type: 'env_manager_log',
              session_id: 'session-1',
            },
          ],
          has_more: false,
          last_id: 'evt-2',
        },
      },
    )

    await expect(
      fetchHistoricalSessionEvents(
        'https://api.dev.noumena.test/v1/sessions/session-1/events',
        { Authorization: 'Bearer session-token' },
      ),
    ).resolves.toEqual([
      {
        type: 'user',
        session_id: 'session-1',
        message: { role: 'user', content: 'Reply with REMOTE_OK.' },
      },
      {
        type: 'assistant',
        session_id: 'session-1',
        message: { role: 'assistant', content: 'REMOTE_OK' },
      },
    ])

    expect(getCalls).toHaveLength(2)
    expect(
      (
        getCalls[0]!.options as {
          headers: Record<string, string>
          params?: Record<string, string>
        }
      ).headers,
    ).toEqual({
      Authorization: 'Bearer session-token',
    })
    expect(
      (
        getCalls[1]!.options as {
          headers: Record<string, string>
          params?: Record<string, string>
        }
      ).params,
    ).toEqual({
      after_id: 'evt-1',
    })
  })
})
