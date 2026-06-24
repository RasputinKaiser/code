import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import axios from 'axios'

import {
  createCodeSession,
  fetchRemoteCredentials,
} from './codeSessionApi.js'

type AxiosResponse = {
  status: number
  data: unknown
}

const originalAxiosPost = axios.post

let postCalls: Array<unknown[]>
let postResponses: AxiosResponse[]
let postError: Error | undefined

beforeEach(() => {
  postCalls = []
  postResponses = []
  postError = undefined

  axios.post = (async (...args: unknown[]) => {
    postCalls.push(args)
    if (postError) {
      throw postError
    }
    const next = postResponses.shift()
    if (!next) {
      throw new Error('Unexpected axios.post call')
    }
    return next as never
  }) as typeof axios.post
})

afterEach(() => {
  axios.post = originalAxiosPost
})

describe('codeSessionApi', () => {
  it('creates a code session with the bridge oneof signal, oauth headers, and optional tags', async () => {
    postResponses.push({
      status: 201,
      data: {
        session: {
          id: 'cse_1234abcd',
        },
      },
    })

    await expect(
      createCodeSession(
        'https://api.noumena.test',
        'oauth-token',
        'Fix bridge regression',
        15_000,
        ['bug', 'bridge'],
      ),
    ).resolves.toBe('cse_1234abcd')

    expect(postCalls).toHaveLength(1)
    const [url, body, options] = postCalls[0] as [
      string,
      Record<string, unknown>,
      {
        headers: Record<string, string>
        timeout: number
        validateStatus: (status: number) => boolean
      },
    ]

    expect(url).toBe('https://api.noumena.test/v1/code/sessions')
    expect(body).toEqual({
      title: 'Fix bridge regression',
      bridge: {},
      tags: ['bug', 'bridge'],
    })
    expect(options.headers).toEqual({
      Authorization: 'Bearer oauth-token',
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    })
    expect(options.timeout).toBe(15_000)
  })

  it('returns null when session creation succeeds at HTTP level but the session id is missing or not a cse id', async () => {
    postResponses.push({
      status: 200,
      data: {
        session: {
          id: 'session_1234abcd',
        },
      },
    })

    await expect(
      createCodeSession(
        'https://api.noumena.test',
        'oauth-token',
        'Bad response shape',
        15_000,
      ),
    ).resolves.toBeNull()
  })

  it('fetches remote credentials with the trusted-device header and parses string worker epochs', async () => {
    postResponses.push({
      status: 200,
      data: {
        worker_jwt: 'jwt-token',
        api_base_url: 'https://api.noumena.test',
        expires_in: 900,
        worker_epoch: '42',
      },
    })

    await expect(
      fetchRemoteCredentials(
        'cse_1234abcd',
        'https://api.noumena.test',
        'oauth-token',
        10_000,
        'trusted-device-token',
      ),
    ).resolves.toEqual({
      worker_jwt: 'jwt-token',
      api_base_url: 'https://api.noumena.test',
      expires_in: 900,
      worker_epoch: 42,
    })

    expect(postCalls).toHaveLength(1)
    const [url, body, options] = postCalls[0] as [
      string,
      Record<string, unknown>,
      {
        headers: Record<string, string>
        timeout: number
        validateStatus: (status: number) => boolean
      },
    ]

    expect(url).toBe('https://api.noumena.test/v1/code/sessions/cse_1234abcd/bridge')
    expect(options.headers).toEqual({
      Authorization: 'Bearer oauth-token',
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'X-Trusted-Device-Token': 'trusted-device-token',
    })
    expect(options.timeout).toBe(10_000)
  })

  it('returns null for malformed bridge credential payloads and network failures', async () => {
    postResponses.push({
      status: 200,
      data: {
        worker_jwt: 'jwt-token',
        api_base_url: 'https://api.noumena.test',
        expires_in: 900,
        worker_epoch: 'not-a-number',
      },
    })

    await expect(
      fetchRemoteCredentials(
        'cse_1234abcd',
        'https://api.noumena.test',
        'oauth-token',
        10_000,
      ),
    ).resolves.toBeNull()

    postError = new Error('socket hang up')

    await expect(
      fetchRemoteCredentials(
        'cse_1234abcd',
        'https://api.noumena.test',
        'oauth-token',
        10_000,
      ),
    ).resolves.toBeNull()
  })
})
