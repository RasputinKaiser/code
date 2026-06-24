import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import axios from 'axios'

import { BridgeFatalError, createBridgeApiClient } from './bridgeApi.js'
import type { BridgeConfig } from './types.js'

type AxiosResponse = {
  status: number
  data: unknown
}

const originalAxiosPost = axios.post
const originalAxiosGet = axios.get
const originalAxiosDelete = axios.delete

const baseConfig: BridgeConfig = {
  dir: '/tmp/worktree',
  machineName: 'devbox',
  branch: 'main',
  gitRepoUrl: 'https://example.com/repo.git',
  maxSessions: 4,
  spawnMode: 'worktree',
  verbose: false,
  sandbox: true,
  bridgeId: 'bridge_1234',
  workerType: 'claude_code',
  environmentId: 'environment_uuid_1234',
  apiBaseUrl: 'https://api.noumena.test',
  sessionIngressUrl: 'wss://api.noumena.test/v1/session_ingress/ws',
  reuseEnvironmentId: 'env_existing_1234',
}

let postCalls: Array<unknown[]>
let getCalls: Array<unknown[]>
let deleteCalls: Array<unknown[]>
let postResponses: AxiosResponse[]
let getResponses: AxiosResponse[]
let deleteResponses: AxiosResponse[]

beforeEach(() => {
  postCalls = []
  getCalls = []
  deleteCalls = []
  postResponses = []
  getResponses = []
  deleteResponses = []

  axios.post = (async (...args: unknown[]) => {
    postCalls.push(args)
    const next = postResponses.shift()
    if (!next) {
      throw new Error('Unexpected axios.post call')
    }
    return next as never
  }) as typeof axios.post

  axios.get = (async (...args: unknown[]) => {
    getCalls.push(args)
    const next = getResponses.shift()
    if (!next) {
      throw new Error('Unexpected axios.get call')
    }
    return next as never
  }) as typeof axios.get

  axios.delete = (async (...args: unknown[]) => {
    deleteCalls.push(args)
    const next = deleteResponses.shift()
    if (!next) {
      throw new Error('Unexpected axios.delete call')
    }
    return next as never
  }) as typeof axios.delete
})

afterEach(() => {
  axios.post = originalAxiosPost
  axios.get = originalAxiosGet
  axios.delete = originalAxiosDelete
})

describe('bridgeApi', () => {
  it('registers bridge environments with the expected payload and trusted-device headers', async () => {
    postResponses.push({
      status: 200,
      data: {
        environment_id: 'env_1234',
        environment_secret: 'secret_1234',
      },
    })

    const api = createBridgeApiClient({
      baseUrl: 'https://api.noumena.test',
      getAccessToken: () => 'oauth-token',
      getTrustedDeviceToken: () => 'trusted-device-token',
      runnerVersion: 'runner-v1',
    })

    await expect(api.registerBridgeEnvironment(baseConfig)).resolves.toEqual({
      environment_id: 'env_1234',
      environment_secret: 'secret_1234',
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

    expect(url).toBe('https://api.noumena.test/v1/environments/bridge')
    expect(body).toEqual({
      machine_name: 'devbox',
      directory: '/tmp/worktree',
      branch: 'main',
      git_repo_url: 'https://example.com/repo.git',
      max_sessions: 4,
      metadata: { worker_type: 'claude_code' },
      environment_id: 'env_existing_1234',
    })
    expect(options.timeout).toBe(15_000)
    expect(options.headers).toEqual({
      Authorization: 'Bearer oauth-token',
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'environments-2025-11-01',
      'x-environment-runner-version': 'runner-v1',
      'X-Trusted-Device-Token': 'trusted-device-token',
    })
  })

  it('retries one time on OAuth 401s and uses the refreshed token on the retry', async () => {
    let accessToken = 'stale-token'
    const refreshCalls: string[] = []
    postResponses.push(
      {
        status: 401,
        data: {
          error: {
            message: 'expired',
            type: 'token_expired',
          },
        },
      },
      {
        status: 200,
        data: {},
      },
    )

    const api = createBridgeApiClient({
      baseUrl: 'https://api.noumena.test',
      getAccessToken: () => accessToken,
      getTrustedDeviceToken: () => 'trusted-device-token',
      onAuth401: async staleAccessToken => {
        refreshCalls.push(staleAccessToken)
        accessToken = 'fresh-token'
        return true
      },
      runnerVersion: 'runner-v1',
    })

    await expect(api.stopWork('env_1234', 'work_5678', true)).resolves.toBe(
      undefined,
    )

    expect(refreshCalls).toEqual(['stale-token'])
    expect(postCalls).toHaveLength(2)

    const firstHeaders = (
      postCalls[0][2] as {
        headers: Record<string, string>
      }
    ).headers
    const secondHeaders = (
      postCalls[1][2] as {
        headers: Record<string, string>
      }
    ).headers

    expect(firstHeaders.Authorization).toBe('Bearer stale-token')
    expect(secondHeaders.Authorization).toBe('Bearer fresh-token')
    expect(firstHeaders['X-Trusted-Device-Token']).toBe(
      'trusted-device-token',
    )
    expect(secondHeaders['X-Trusted-Device-Token']).toBe(
      'trusted-device-token',
    )
  })

  it('treats archive 409 responses as a successful idempotent no-op', async () => {
    postResponses.push({
      status: 409,
      data: {
        error: {
          message: 'already archived',
        },
      },
    })

    const api = createBridgeApiClient({
      baseUrl: 'https://api.noumena.test',
      getAccessToken: () => 'oauth-token',
      runnerVersion: 'runner-v1',
    })

    await expect(api.archiveSession('session_1234')).resolves.toBe(undefined)
    expect(postCalls).toHaveLength(1)
  })

  it('surfaces expired 403 bridge errors as fatal session-expired failures', async () => {
    postResponses.push({
      status: 403,
      data: {
        error: {
          message: 'environment expired',
          type: 'environment_expired',
        },
      },
    })

    const api = createBridgeApiClient({
      baseUrl: 'https://api.noumena.test',
      getAccessToken: () => 'oauth-token',
      runnerVersion: 'runner-v1',
    })

    let thrown: unknown
    try {
      await api.reconnectSession('env_1234', 'session_1234')
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(BridgeFatalError)
    expect((thrown as BridgeFatalError).status).toBe(403)
    expect((thrown as BridgeFatalError).errorType).toBe('environment_expired')
    expect((thrown as Error).message).toBe(
      'Remote Control session has expired. Please restart with `ncode remote-control` or /remote-control.',
    )
  })

  it('rejects unsafe ids before interpolating them into bridge API paths', async () => {
    const api = createBridgeApiClient({
      baseUrl: 'https://api.noumena.test',
      getAccessToken: () => 'oauth-token',
      runnerVersion: 'runner-v1',
    })

    await expect(
      api.pollForWork('../etc/passwd', 'environment-secret'),
    ).rejects.toThrow('Invalid environmentId: contains unsafe characters')
    expect(getCalls).toHaveLength(0)
  })
})
