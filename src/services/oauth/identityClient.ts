import axios from 'axios'
import {
  getOauthTokenUrl,
} from 'src/constants/oauth.js'
import { buildNoumenaPlatformUrl } from 'src/utils/platformUrls.js'
import type { Utilization } from '../api/usage.js'
import type { UltrareviewQuotaResponse } from '../api/ultrareviewQuota.js'
import type {
  OAuthProfileResponse,
  OAuthTokenExchangeResponse,
  UserRolesResponse,
} from './types.js'

export type IdentityClient = {
  getOauthProfileFromApiKey(args: {
    apiKey: string
    accountUuid: string
    betaHeader: string
    timeout: number
  }): Promise<OAuthProfileResponse>
  getOauthProfileFromOauthToken(args: {
    accessToken: string
    timeout: number
  }): Promise<OAuthProfileResponse>
  exchangeCodeForTokens(args: {
    requestBody: Record<string, string | number>
    timeout: number
  }): Promise<OAuthTokenExchangeResponse>
  refreshOAuthToken(args: {
    requestBody: {
      grant_type: 'refresh_token'
      refresh_token: string
      client_id: string
      scope: string
    }
    timeout: number
  }): Promise<OAuthTokenExchangeResponse>
  fetchUserRoles(args: {
    accessToken: string
  }): Promise<UserRolesResponse>
  createApiKey(args: {
    accessToken: string
  }): Promise<{ raw_key?: string; status: number }>
  fetchBootstrap(args: {
    headers: Record<string, string>
    timeout: number
  }): Promise<unknown>
  fetchUtilization(args: {
    headers: Record<string, string>
    timeout: number
  }): Promise<Utilization>
  fetchUltrareviewQuota(args: {
    headers: Record<string, string>
    timeout: number
  }): Promise<UltrareviewQuotaResponse>
}

export function getIdentityClient(): IdentityClient {
  return {
    async getOauthProfileFromApiKey({
      apiKey,
      accountUuid,
      betaHeader,
      timeout,
    }) {
      // Legacy path name retained for contract compatibility.
      const endpoint = buildNoumenaPlatformUrl('/api/claude_cli_profile')
      const response = await axios.get<OAuthProfileResponse>(endpoint, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-beta': betaHeader,
        },
        params: {
          account_uuid: accountUuid,
        },
        timeout,
      })
      return response.data
    },

    async getOauthProfileFromOauthToken({ accessToken, timeout }) {
      const endpoint = buildNoumenaPlatformUrl('/api/oauth/profile')
      const response = await axios.get<OAuthProfileResponse>(endpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout,
      })
      return response.data
    },

    async exchangeCodeForTokens({ requestBody, timeout }) {
      // Noumena's authorization_code grant currently requires a form-encoded
      // body even though refresh_token accepts JSON.
      const response = await axios.post<OAuthTokenExchangeResponse>(
        getOauthTokenUrl(),
        new URLSearchParams(
          Object.entries(requestBody).map(([key, value]) => [key, String(value)]),
        ),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout,
        },
      )
      return response.data
    },

    async refreshOAuthToken({ requestBody, timeout }) {
      const response = await axios.post<OAuthTokenExchangeResponse>(
        getOauthTokenUrl(),
        requestBody,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout,
        },
      )
      return response.data
    },

    async fetchUserRoles({ accessToken }) {
      const endpoint = buildNoumenaPlatformUrl('/api/oauth/ncode/roles')
      const response = await axios.get<UserRolesResponse>(endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      return response.data
    },

    async createApiKey({ accessToken }) {
      const endpoint = buildNoumenaPlatformUrl(
        '/api/oauth/ncode/create_api_key',
      )
      const response = await axios.post<{ raw_key?: string }>(
        endpoint,
        null,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      )
      return {
        ...response.data,
        status: response.status,
      }
    },

    async fetchBootstrap({ headers, timeout }) {
      const endpoint = buildNoumenaPlatformUrl('/api/claude_cli/bootstrap')
      const response = await axios.get<unknown>(endpoint, {
        headers,
        timeout,
      })
      return response.data
    },

    async fetchUtilization({ headers, timeout }) {
      const endpoint = buildNoumenaPlatformUrl('/api/oauth/usage')
      const response = await axios.get<Utilization>(endpoint, {
        headers,
        timeout,
      })
      return response.data
    },

    async fetchUltrareviewQuota({ headers, timeout }) {
      const endpoint = buildNoumenaPlatformUrl('/v1/ultrareview/quota')
      const response = await axios.get<UltrareviewQuotaResponse>(endpoint, {
        headers,
        timeout,
      })
      return response.data
    },
  }
}
