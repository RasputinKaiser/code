import axios from 'axios'
import { buildNoumenaPlatformUrl } from 'src/utils/platformUrls.js'
import { resolveManagedRemoteCapability } from '../../auth/capabilities/remote.js'
import { toError } from '../errors.js'
import { logError } from '../log.js'
import { getOAuthHeaders } from './api.js'

export const LEGACY_CLOUD_ENVIRONMENT_KIND = 'anthropic_cloud' as const
export const NOUMENA_CLOUD_ENVIRONMENT_KIND = 'noumena_cloud' as const

export type EnvironmentKind =
  | typeof NOUMENA_CLOUD_ENVIRONMENT_KIND
  | typeof LEGACY_CLOUD_ENVIRONMENT_KIND
  | 'byoc'
  | 'bridge'
export type EnvironmentState = 'active'

export type EnvironmentResource = {
  kind: EnvironmentKind
  environment_id: string
  name: string
  created_at: string
  state: EnvironmentState
}

export type EnvironmentListResponse = {
  environments: EnvironmentResource[]
  has_more: boolean
  first_id: string | null
  last_id: string | null
}

export function isManagedCloudEnvironmentKind(kind: string): boolean {
  return (
    kind === NOUMENA_CLOUD_ENVIRONMENT_KIND ||
    kind === LEGACY_CLOUD_ENVIRONMENT_KIND
  )
}

export function normalizeEnvironmentKind(kind: string): EnvironmentKind {
  if (isManagedCloudEnvironmentKind(kind)) {
    return NOUMENA_CLOUD_ENVIRONMENT_KIND
  }
  if (kind === 'byoc' || kind === 'bridge') {
    return kind
  }
  return kind as EnvironmentKind
}

/**
 * Fetches the list of available environments from the Environment API
 * @returns Promise<EnvironmentResource[]> Array of available environments
 * @throws Error if the API request fails or no access token is available
 */
export async function fetchEnvironments(): Promise<EnvironmentResource[]> {
  const { accessToken, orgUUID } = await resolveManagedRemoteCapability()

  const url = buildNoumenaPlatformUrl('/v1/environment_providers')

  try {
    const headers = {
      ...getOAuthHeaders(accessToken),
      'x-organization-uuid': orgUUID,
    }

    const response = await axios.get<EnvironmentListResponse>(url, {
      headers,
      timeout: 15000,
    })

    if (response.status !== 200) {
      throw new Error(
        `Failed to fetch environments: ${response.status} ${response.statusText}`,
      )
    }

    return response.data.environments.map(environment => ({
      ...environment,
      kind: normalizeEnvironmentKind(environment.kind),
    }))
  } catch (error) {
    const err = toError(error)
    logError(err)
    throw new Error(`Failed to fetch environments: ${err.message}`)
  }
}

/**
 * Creates a default noumena_cloud environment for users who have none.
 * Uses the public environment_providers route (same auth as fetchEnvironments).
 */
export async function createDefaultCloudEnvironment(
  name: string,
): Promise<EnvironmentResource> {
  const { accessToken, orgUUID } = await resolveManagedRemoteCapability()

  const url = buildNoumenaPlatformUrl('/v1/environment_providers/cloud/create')
  const response = await axios.post<EnvironmentResource>(
    url,
    {
      name,
      kind: NOUMENA_CLOUD_ENVIRONMENT_KIND,
      description: '',
      config: {
        environment_type: 'noumena',
        cwd: '/home/user',
        init_script: null,
        environment: {},
        languages: [
          { name: 'python', version: '3.11' },
          { name: 'node', version: '20' },
        ],
        network_config: {
          allowed_hosts: [],
          allow_default_hosts: true,
        },
      },
    },
    {
      headers: {
        ...getOAuthHeaders(accessToken),
        'anthropic-beta': 'ccr-byoc-2025-07-29',
        'x-organization-uuid': orgUUID,
      },
      timeout: 15000,
    },
  )
  return response.data
}
