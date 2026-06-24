import axios from 'axios'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { getIdentityClient } from './identityClient.js'

const axiosGetCalls: Array<unknown[]> = []
const axiosPostCalls: Array<unknown[]> = []

const originalAxiosGet = axios.get
const originalAxiosPost = axios.post
const originalNoumenaIssuerBaseUrl = process.env.NOUMENA_ISSUER_BASE_URL
const originalNoumenaPlatformBaseUrl = process.env.NOUMENA_PLATFORM_BASE_URL

function restoreEnvVar(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

function resetCallsAndEnv(): void {
  axiosGetCalls.length = 0
  axiosPostCalls.length = 0
  process.env.NOUMENA_ISSUER_BASE_URL = 'https://auth.noumena.test'
  process.env.NOUMENA_PLATFORM_BASE_URL = 'https://api.noumena.test'
}

beforeEach(() => {
  resetCallsAndEnv()
  axios.get = (async (...args: unknown[]) => {
    axiosGetCalls.push(args)
    return { data: { ok: true } }
  }) as typeof axios.get
  axios.post = (async (...args: unknown[]) => {
    axiosPostCalls.push(args)
    return { data: { ok: true }, status: 201 }
  }) as typeof axios.post
})

afterEach(() => {
  axios.get = originalAxiosGet
  axios.post = originalAxiosPost
  restoreEnvVar('NOUMENA_ISSUER_BASE_URL', originalNoumenaIssuerBaseUrl)
  restoreEnvVar('NOUMENA_PLATFORM_BASE_URL', originalNoumenaPlatformBaseUrl)
})

describe('getIdentityClient', () => {
  it('delegates oauth profile lookups and token exchange to axios with the expected endpoints', async () => {
    const client = getIdentityClient()

    expect(
      await client.getOauthProfileFromApiKey({
        apiKey: 'api-key',
        accountUuid: 'acct-1',
        betaHeader: 'oauth-beta',
        timeout: 10_000,
      }),
    ).toEqual({ ok: true })

    expect(
      await client.getOauthProfileFromOauthToken({
        accessToken: 'token-1',
        timeout: 5_000,
      }),
    ).toEqual({ ok: true })

    expect(
      await client.exchangeCodeForTokens({
        requestBody: {
          grant_type: 'authorization_code',
          code: 'code',
          state: 'state',
          client_id: 'client',
          redirect_uri: 'http://localhost/callback',
          code_verifier: 'verifier',
        },
        timeout: 15_000,
      }),
    ).toEqual({ ok: true })

    expect(
      await client.refreshOAuthToken({
        requestBody: {
          grant_type: 'refresh_token',
          refresh_token: 'refresh',
          client_id: 'client',
          scope: 'user:profile',
        },
        timeout: 15_000,
      }),
    ).toEqual({ ok: true })

    expect(axiosGetCalls).toEqual([
      [
        'https://api.noumena.test/api/claude_cli_profile',
        {
          headers: {
            'x-api-key': 'api-key',
            'anthropic-beta': 'oauth-beta',
          },
          params: {
            account_uuid: 'acct-1',
          },
          timeout: 10_000,
        },
      ],
      [
        'https://api.noumena.test/api/oauth/profile',
        {
          headers: {
            Authorization: 'Bearer token-1',
            'Content-Type': 'application/json',
          },
          timeout: 5_000,
        },
      ],
    ])

    expect(axiosPostCalls).toHaveLength(2)
    expect(axiosPostCalls[0]).toEqual([
      'https://auth.noumena.test/oauth/token',
      expect.any(URLSearchParams),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 15_000,
      },
    ])
    expect((axiosPostCalls[0]?.[1] as URLSearchParams).toString()).toBe(
      'grant_type=authorization_code&code=code&state=state&client_id=client&redirect_uri=http%3A%2F%2Flocalhost%2Fcallback&code_verifier=verifier',
    )
    expect(axiosPostCalls[1]).toEqual([
      'https://auth.noumena.test/oauth/token',
      {
        grant_type: 'refresh_token',
        refresh_token: 'refresh',
        client_id: 'client',
        scope: 'user:profile',
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15_000,
      },
    ])
  })

  it('delegates bootstrap, usage, quota, roles, and api-key requests to axios with the expected endpoints', async () => {
    const client = getIdentityClient()

    expect(
      await client.fetchBootstrap({
        headers: { Authorization: 'Bearer oauth-token' },
        timeout: 5_000,
      }),
    ).toEqual({ ok: true })

    expect(
      await client.fetchUtilization({
        headers: { Authorization: 'Bearer oauth-token' },
        timeout: 5_000,
      }),
    ).toEqual({ ok: true })

    expect(
      await client.fetchUltrareviewQuota({
        headers: { Authorization: 'Bearer oauth-token' },
        timeout: 5_000,
      }),
    ).toEqual({ ok: true })

    expect(
      await client.fetchUserRoles({
        accessToken: 'oauth-token',
      }),
    ).toEqual({ ok: true })

    expect(
      await client.createApiKey({
        accessToken: 'oauth-token',
      }),
    ).toEqual({ ok: true, status: 201 })

    expect(axiosGetCalls).toEqual([
      [
        'https://api.noumena.test/api/claude_cli/bootstrap',
        {
          headers: { Authorization: 'Bearer oauth-token' },
          timeout: 5_000,
        },
      ],
      [
        'https://api.noumena.test/api/oauth/usage',
        {
          headers: { Authorization: 'Bearer oauth-token' },
          timeout: 5_000,
        },
      ],
      [
        'https://api.noumena.test/v1/ultrareview/quota',
        {
          headers: { Authorization: 'Bearer oauth-token' },
          timeout: 5_000,
        },
      ],
      [
        'https://api.noumena.test/api/oauth/ncode/roles',
        {
          headers: { Authorization: 'Bearer oauth-token' },
        },
      ],
    ])

    expect(axiosPostCalls).toEqual([
      [
        'https://api.noumena.test/api/oauth/ncode/create_api_key',
        null,
        {
          headers: { Authorization: 'Bearer oauth-token' },
        },
      ],
    ])
  })

  it('prefers NOUMENA_PLATFORM_BASE_URL for BASE_API_URL-backed identity calls only', async () => {
    process.env.NOUMENA_PLATFORM_BASE_URL = 'https://platform-api.noumena.test'
    const client = getIdentityClient()

    await client.getOauthProfileFromApiKey({
      apiKey: 'api-key',
      accountUuid: 'acct-1',
      betaHeader: 'oauth-beta',
      timeout: 10_000,
    })
    await client.fetchBootstrap({
      headers: { Authorization: 'Bearer oauth-token' },
      timeout: 5_000,
    })
    await client.fetchUtilization({
      headers: { Authorization: 'Bearer oauth-token' },
      timeout: 5_000,
    })
    await client.fetchUltrareviewQuota({
      headers: { Authorization: 'Bearer oauth-token' },
      timeout: 5_000,
    })
    await client.fetchUserRoles({ accessToken: 'oauth-token' })
    await client.createApiKey({ accessToken: 'oauth-token' })

    expect(axiosGetCalls).toEqual([
      [
        'https://platform-api.noumena.test/api/claude_cli_profile',
        expect.any(Object),
      ],
      [
        'https://platform-api.noumena.test/api/claude_cli/bootstrap',
        expect.any(Object),
      ],
      [
        'https://platform-api.noumena.test/api/oauth/usage',
        expect.any(Object),
      ],
      [
        'https://platform-api.noumena.test/v1/ultrareview/quota',
        expect.any(Object),
      ],
      [
        'https://platform-api.noumena.test/api/oauth/ncode/roles',
        expect.any(Object),
      ],
    ])

    expect(axiosPostCalls).toEqual([
      [
        'https://platform-api.noumena.test/api/oauth/ncode/create_api_key',
        null,
        expect.any(Object),
      ],
    ])
  })
})
