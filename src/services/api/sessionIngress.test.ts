import axios from 'axios'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  appendSessionLog,
  clearAllSessions,
  getSessionLogs,
} from './sessionIngress.js'

type PutResponse = {
  status: number
  data: unknown
  headers?: Record<string, string>
  statusText?: string
}

type GetResponse = {
  status: number
  data: unknown
  headers?: Record<string, string>
  statusText?: string
}

const originalAxiosPut = axios.put
const originalAxiosGet = axios.get
const originalSessionToken = process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN
const originalAfterLastCompact = process.env.CLAUDE_AFTER_LAST_COMPACT

const putCalls: Array<{
  url: string
  body: unknown
  options?: unknown
}> = []
const getCalls: Array<{
  url: string
  options?: unknown
}> = []

let putResponses: PutResponse[] = []
let getResponses: GetResponse[] = []

beforeEach(() => {
  process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN = 'session-jwt-token'
  delete process.env.CLAUDE_AFTER_LAST_COMPACT
  clearAllSessions()
  putCalls.length = 0
  getCalls.length = 0
  putResponses = []
  getResponses = []

  axios.put = (async (url: string, body?: unknown, options?: unknown) => {
    putCalls.push({ url, body, options })
    const next = putResponses.shift()
    if (!next) {
      throw new Error('Unexpected axios.put call')
    }
    return next as never
  }) as typeof axios.put

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
  axios.put = originalAxiosPut
  axios.get = originalAxiosGet
  if (originalSessionToken === undefined) {
    delete process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN
  } else {
    process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN = originalSessionToken
  }
  if (originalAfterLastCompact === undefined) {
    delete process.env.CLAUDE_AFTER_LAST_COMPACT
  } else {
    process.env.CLAUDE_AFTER_LAST_COMPACT = originalAfterLastCompact
  }
  clearAllSessions()
})

describe('sessionIngress', () => {
  it('chains Last-Uuid headers across successful appends in the same session', async () => {
    putResponses.push(
      { status: 200, data: {} },
      { status: 200, data: {} },
    )

    await expect(
      appendSessionLog(
        'session-1',
        { uuid: 'uuid-1', type: 'user' } as never,
        'https://api.noumena.test/v1/session_ingress/session/session-1',
      ),
    ).resolves.toBe(true)

    await expect(
      appendSessionLog(
        'session-1',
        { uuid: 'uuid-2', type: 'assistant' } as never,
        'https://api.noumena.test/v1/session_ingress/session/session-1',
      ),
    ).resolves.toBe(true)

    expect(putCalls).toHaveLength(2)
    expect(
      (
        putCalls[0]!.options as {
          headers: Record<string, string>
        }
      ).headers,
    ).toEqual({
      Authorization: 'Bearer session-jwt-token',
      'Content-Type': 'application/json',
    })
    expect(
      (
        putCalls[1]!.options as {
          headers: Record<string, string>
        }
      ).headers,
    ).toEqual({
      Authorization: 'Bearer session-jwt-token',
      'Content-Type': 'application/json',
      'Last-Uuid': 'uuid-1',
    })
  })

  it('adopts the server last uuid on 409 and retries the append with the updated chain head', async () => {
    putResponses.push(
      {
        status: 409,
        data: {
          error: { message: 'stale last uuid' },
        },
        headers: { 'x-last-uuid': 'uuid-server' },
      },
      { status: 201, data: {} },
    )

    await expect(
      appendSessionLog(
        'session-2',
        { uuid: 'uuid-client', type: 'assistant' } as never,
        'https://api.noumena.test/v1/session_ingress/session/session-2',
      ),
    ).resolves.toBe(true)

    expect(putCalls).toHaveLength(2)
    expect(
      (
        putCalls[1]!.options as {
          headers: Record<string, string>
        }
      ).headers['Last-Uuid'],
    ).toBe('uuid-server')
  })

  it('stops immediately on 401 append failures instead of retrying', async () => {
    putResponses.push({
      status: 401,
      statusText: 'Unauthorized',
      data: {
        error: { message: 'expired token' },
      },
    })

    await expect(
      appendSessionLog(
        'session-3',
        { uuid: 'uuid-unauthorized', type: 'assistant' } as never,
        'https://api.noumena.test/v1/session_ingress/session/session-3',
      ),
    ).resolves.toBe(false)

    expect(putCalls).toHaveLength(1)
  })

  it('hydrates session logs and seeds the next append with the fetched last uuid', async () => {
    getResponses.push({
      status: 200,
      data: {
        loglines: [
          { uuid: 'uuid-a', type: 'user' },
          { uuid: 'uuid-b', type: 'assistant' },
        ],
      },
    })
    putResponses.push({ status: 200, data: {} })

    await expect(
      getSessionLogs(
        'session-4',
        'https://api.noumena.test/v1/session_ingress/session/session-4',
      ),
    ).resolves.toEqual([
      { uuid: 'uuid-a', type: 'user' },
      { uuid: 'uuid-b', type: 'assistant' },
    ])

    await appendSessionLog(
      'session-4',
      { uuid: 'uuid-c', type: 'assistant' } as never,
      'https://api.noumena.test/v1/session_ingress/session/session-4',
    )

    expect(getCalls).toHaveLength(1)
    expect(
      (
        getCalls[0]!.options as {
          headers: Record<string, string>
        }
      ).headers,
    ).toEqual({
      Authorization: 'Bearer session-jwt-token',
    })
    expect(
      (
        putCalls[0]!.options as {
          headers: Record<string, string>
        }
      ).headers['Last-Uuid'],
    ).toBe('uuid-b')
  })
})
