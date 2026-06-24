import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import axios from 'axios'

let axiosCalls: Array<unknown[]> = []
let axiosResponse: { data?: unknown } = {
  data: {
    worker_epoch: '42',
  },
}

const originalAxiosPost = axios.post

const {
  buildCCRv2SdkUrl,
  buildSdkUrl,
  decodeWorkSecret,
  registerWorker,
  sameSessionId,
} = await import(import.meta.resolve('./workSecret.ts'))

function encodeSecret(secret: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(secret)).toString('base64url')
}

beforeEach(() => {
  axiosCalls = []
  axiosResponse = {
    data: {
      worker_epoch: '42',
    },
  }
  axios.post = (async (...args: unknown[]) => {
    axiosCalls.push(args)
    return axiosResponse as never
  }) as typeof axios.post
})

afterEach(() => {
  axios.post = originalAxiosPost
})

describe('decodeWorkSecret', () => {
  it('decodes version-1 work secrets and preserves required bridge fields', () => {
    const secret = encodeSecret({
      version: 1,
      session_ingress_token: 'ingress-token',
      api_base_url: 'https://api.noumena.test',
      sources: [{ type: 'git' }],
      auth: [{ type: 'oauth', token: 'oauth-token' }],
      use_code_sessions: true,
    })

    expect(decodeWorkSecret(secret)).toEqual({
      version: 1,
      session_ingress_token: 'ingress-token',
      api_base_url: 'https://api.noumena.test',
      sources: [{ type: 'git' }],
      auth: [{ type: 'oauth', token: 'oauth-token' }],
      use_code_sessions: true,
    })
  })

  it('rejects unsupported versions and missing required fields', () => {
    expect(() =>
      decodeWorkSecret(
        encodeSecret({
          version: 2,
          session_ingress_token: 'ingress-token',
          api_base_url: 'https://api.noumena.test',
          sources: [],
          auth: [],
        }),
      ),
    ).toThrow('Unsupported work secret version: 2')

    expect(() =>
      decodeWorkSecret(
        encodeSecret({
          version: 1,
          session_ingress_token: '',
          api_base_url: 'https://api.noumena.test',
          sources: [],
          auth: [],
        }),
      ),
    ).toThrow('Invalid work secret: missing or empty session_ingress_token')

    expect(() =>
      decodeWorkSecret(
        encodeSecret({
          version: 1,
          session_ingress_token: 'ingress-token',
          sources: [],
          auth: [],
        }),
      ),
    ).toThrow('Invalid work secret: missing api_base_url')
  })
})

describe('workSecret URL helpers', () => {
  it('builds ingress and CCR URLs with the expected local-vs-prod routing semantics', () => {
    expect(buildSdkUrl('https://api.noumena.test/', 'session-1')).toBe(
      'wss://api.noumena.test/v1/session_ingress/ws/session-1',
    )
    expect(buildSdkUrl('http://localhost:8080/', 'session-2')).toBe(
      'ws://localhost:8080/v2/session_ingress/ws/session-2',
    )
    expect(buildSdkUrl('http://127.0.0.1:8080', 'session-3')).toBe(
      'ws://127.0.0.1:8080/v2/session_ingress/ws/session-3',
    )
    expect(buildCCRv2SdkUrl('https://api.noumena.test/', 'cse_1234')).toBe(
      'https://api.noumena.test/v1/code/sessions/cse_1234',
    )
  })
})

describe('sameSessionId', () => {
  it('matches compat and infra session ids with the same UUID body and rejects malformed short suffixes', () => {
    expect(sameSessionId('cse_1234abcd', 'session_1234abcd')).toBe(true)
    expect(
      sameSessionId('cse_staging_1234abcd', 'session_staging_1234abcd'),
    ).toBe(true)
    expect(sameSessionId('session_local_1234abcd', 'cse_1234abcd')).toBe(true)
    expect(sameSessionId('session_1234abcd', 'session_9999ffff')).toBe(false)
    expect(sameSessionId('cse_ab', 'session_ab')).toBe(false)
  })
})

describe('registerWorker', () => {
  it('posts to the worker register endpoint with auth headers and parses string worker epochs', async () => {
    expect(
      await registerWorker(
        'https://api.noumena.test/v1/code/sessions/cse_1234',
        'access-token',
      ),
    ).toBe(42)

    expect(axiosCalls).toEqual([
      [
        'https://api.noumena.test/v1/code/sessions/cse_1234/worker/register',
        {},
        {
          headers: {
            Authorization: 'Bearer access-token',
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
          },
          timeout: 10_000,
        },
      ],
    ])
  })

  it('rejects invalid worker epochs from the register response', async () => {
    axiosResponse = {
      data: {
        worker_epoch: 'not-a-number',
      },
    }

    await expect(
      registerWorker(
        'https://api.noumena.test/v1/code/sessions/cse_1234',
        'access-token',
      ),
    ).rejects.toThrow('registerWorker: invalid worker_epoch')
  })
})
