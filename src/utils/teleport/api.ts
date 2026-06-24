import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'
import { randomUUID } from 'crypto'
import { buildNoumenaPlatformUrl } from 'src/utils/platformUrls.js'
import z from 'zod/v4'
import {
  MANAGED_REMOTE_AUTH_REQUIRED_MESSAGE,
  resolveManagedRemoteCapability,
} from '../../auth/capabilities/remote.js'
import { logForDebugging } from '../debug.js'
import { parseGitHubRepository } from '../detectRepository.js'
import { errorMessage, toError } from '../errors.js'
import { lazySchema } from '../lazySchema.js'
import { logError } from '../log.js'
import { sleep } from '../sleep.js'
import { jsonStringify } from '../slowOperations.js'

// Retry configuration for teleport API requests
const TELEPORT_RETRY_DELAYS = [2000, 4000, 8000, 16000] // 4 retries with exponential backoff
const MAX_TELEPORT_RETRIES = TELEPORT_RETRY_DELAYS.length

export const CCR_BYOC_BETA = 'ccr-byoc-2025-07-29'
export { MANAGED_REMOTE_AUTH_REQUIRED_MESSAGE }

/**
 * Checks if an axios error is a transient network error that should be retried
 */
export function isTransientNetworkError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return false
  }

  // Retry on network errors (no response received)
  if (!error.response) {
    return true
  }

  // Retry on server errors (5xx)
  if (error.response.status >= 500) {
    return true
  }

  // Don't retry on client errors (4xx) - they're not transient
  return false
}

/**
 * Makes an axios GET request with automatic retry for transient network errors
 * Uses exponential backoff: 2s, 4s, 8s, 16s (4 retries = 5 total attempts)
 */
export async function axiosGetWithRetry<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<AxiosResponse<T>> {
  let lastError: unknown

  for (let attempt = 0; attempt <= MAX_TELEPORT_RETRIES; attempt++) {
    try {
      return await axios.get<T>(url, config)
    } catch (error) {
      lastError = error

      // Don't retry if this isn't a transient error
      if (!isTransientNetworkError(error)) {
        throw error
      }

      // Don't retry if we've exhausted all retries
      if (attempt >= MAX_TELEPORT_RETRIES) {
        logForDebugging(
          `Teleport request failed after ${attempt + 1} attempts: ${errorMessage(error)}`,
        )
        throw error
      }

      const delay = TELEPORT_RETRY_DELAYS[attempt] ?? 2000
      logForDebugging(
        `Teleport request failed (attempt ${attempt + 1}/${MAX_TELEPORT_RETRIES + 1}), retrying in ${delay}ms: ${errorMessage(error)}`,
      )
      await sleep(delay)
    }
  }

  throw lastError
}

// Types matching the actual Sessions API response from api/schemas/sessions/sessions.py
export type SessionStatus = 'requires_action' | 'running' | 'idle' | 'archived'

export type GitSource = {
  type: 'git_repository'
  url: string
  revision?: string | null
  allow_unrestricted_git_push?: boolean
}

export type NoumenaWorkspaceSource = {
  type: 'noumena_workspace'
  workspace_id: string
  repo: string
  raw_workspace_name: string
  checkout_path: string
  workspace_version?: number
  workspace_state?: string
}

export type KnowledgeBaseSource = {
  type: 'knowledge_base'
  knowledge_base_id: string
}

export type SessionContextSource =
  | GitSource
  | NoumenaWorkspaceSource
  | KnowledgeBaseSource

// Outcome types from api/schemas/sandbox.py
export type OutcomeGitInfo = {
  type: 'github'
  repo: string
  branches: string[]
}

export type GitRepositoryOutcome = {
  type: 'git_repository'
  git_info: OutcomeGitInfo
}

export type Outcome = GitRepositoryOutcome

export type RemoteSessionRuntimeKind = 'ncode_remote' | 'codex_app_server'
export type RemoteSessionProviderMode =
  | 'noumena_managed'
  | 'byok'
  | 'byok_openai'
export type RemoteSessionTokenTransport =
  | 'legacy_oauth_env'
  | 'static_api_key_env'

export type RemoteSessionRuntime = {
  kind: RemoteSessionRuntimeKind
  provider_mode: RemoteSessionProviderMode
  token_transport?: RemoteSessionTokenTransport | null
  interface?: 'sdk' | 'terminal_pty' | null
}

export type SessionContext = {
  sources: SessionContextSource[]
  cwd: string
  outcomes: Outcome[] | null
  custom_system_prompt: string | null
  append_system_prompt: string | null
  model: string | null
  // Seed filesystem with a git bundle on Files API
  seed_bundle_file_id?: string
  // Seed filesystem with a tar archive on Files API
  seed_archive_file_id?: string
  github_pr?: { owner: string; repo: string; number: number }
  reuse_outcome_branches?: boolean
  environment_variables?: Record<string, string>
  runtime?: RemoteSessionRuntime
}

export type SessionResource = {
  type: 'session'
  id: string
  title: string | null
  session_status: SessionStatus
  environment_id: string
  created_at: string
  updated_at: string
  session_context: SessionContext
}

export type ListSessionsResponse = {
  data: SessionResource[]
  has_more: boolean
  first_id: string | null
  last_id: string | null
}

export const CodeSessionSchema = lazySchema(() =>
  z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    status: z.enum([
      'idle',
      'working',
      'waiting',
      'completed',
      'archived',
      'cancelled',
      'rejected',
    ]),
    repo: z
      .object({
        name: z.string(),
        owner: z.object({
          login: z.string(),
        }),
        default_branch: z.string().optional(),
      })
      .nullable(),
    turns: z.array(z.string()),
    created_at: z.string(),
    updated_at: z.string(),
  }),
)

// Export the inferred type from the Zod schema
export type CodeSession = z.infer<ReturnType<typeof CodeSessionSchema>>

/**
 * Validates and prepares for API requests
 * @returns Object containing access token and organization UUID
 */
export async function prepareApiRequest(): Promise<{
  accessToken: string
  orgUUID: string
}> {
  const capability = await resolveManagedRemoteCapability()
  return {
    accessToken: capability.accessToken,
    orgUUID: capability.orgUUID,
  }
}

/**
 * Fetches code sessions from the new Sessions API (/v1/sessions)
 * @returns Array of code sessions
 */
export async function fetchCodeSessionsFromSessionsAPI(): Promise<
  CodeSession[]
> {
  const { accessToken, orgUUID } = await prepareApiRequest()

  const url = buildNoumenaPlatformUrl('/v1/sessions')

  try {
    const headers = {
      ...getOAuthHeaders(accessToken),
      'anthropic-beta': 'ccr-byoc-2025-07-29',
      'x-organization-uuid': orgUUID,
    }

    const response = await axiosGetWithRetry<ListSessionsResponse>(url, {
      headers,
    })

    if (response.status !== 200) {
      throw new Error(`Failed to fetch code sessions: ${response.statusText}`)
    }

    // Transform SessionResource[] to CodeSession[] format
    const sessions: CodeSession[] = response.data.data.map(session => {
      const gitSource = getGitSourceFromSessionContext(session.session_context)
      const repoRef = getSessionRepoRef(session.session_context)

      let repo: CodeSession['repo'] = null
      if (repoRef) {
        repo = {
          name: repoRef.name,
          owner: {
            login: repoRef.owner,
          },
          default_branch: gitSource?.revision || undefined,
        }
      }

      return {
        id: session.id,
        title: session.title || 'Untitled',
        description: '', // SessionResource doesn't have description field
        status: session.session_status as CodeSession['status'], // Map session_status to status
        repo,
        turns: [], // SessionResource doesn't have turns field
        created_at: session.created_at,
        updated_at: session.updated_at,
      }
    })

    return sessions
  } catch (error) {
    const err = toError(error)
    logError(err)
    throw error
  }
}

/**
 * Creates OAuth headers for API requests
 * @param accessToken The OAuth access token
 * @returns Headers object with Authorization, Content-Type, and anthropic-version
 */
export function getOAuthHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  }
}

/**
 * Fetches a single session by ID from the Sessions API
 * @param sessionId The session ID to fetch
 * @returns The session resource
 */
export async function fetchSession(
  sessionId: string,
): Promise<SessionResource> {
  const { accessToken, orgUUID } = await prepareApiRequest()

  const url = buildNoumenaPlatformUrl(`/v1/sessions/${sessionId}`)
  const headers = {
    ...getOAuthHeaders(accessToken),
    'anthropic-beta': 'ccr-byoc-2025-07-29',
    'x-organization-uuid': orgUUID,
  }

  const response = await axios.get<SessionResource>(url, {
    headers,
    timeout: 15000,
    validateStatus: status => status < 500,
  })

  if (response.status !== 200) {
    // Extract error message from response if available
    const errorData = response.data as { error?: { message?: string } }
    const apiMessage = errorData?.error?.message

    if (response.status === 404) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    if (response.status === 401) {
      throw new Error('Session expired. Please run /login to sign in again.')
    }

    throw new Error(
      apiMessage ||
        `Failed to fetch session: ${response.status} ${response.statusText}`,
    )
  }

  return response.data
}

/**
 * Extracts the first branch name from a session's git repository outcomes
 * @param session The session resource to extract from
 * @returns The first branch name, or undefined if none found
 */
export function getBranchFromSession(
  session: SessionResource,
): string | undefined {
  const gitOutcome = session.session_context.outcomes?.find(
    (outcome): outcome is GitRepositoryOutcome =>
      outcome.type === 'git_repository',
  )
  return gitOutcome?.git_info?.branches[0]
}

export function getGitSourceFromSessionContext(sessionContext: {
  sources: SessionContextSource[]
}): GitSource | undefined {
  return sessionContext.sources.find(
    (source): source is GitSource => source.type === 'git_repository',
  )
}

export function getNoumenaWorkspaceSourceFromSessionContext(sessionContext: {
  sources: SessionContextSource[]
}): NoumenaWorkspaceSource | undefined {
  return sessionContext.sources.find(
    (source): source is NoumenaWorkspaceSource =>
      source.type === 'noumena_workspace',
  )
}

export function formatNoumenaWorkspaceDisplay(
  workspaceSource: Pick<
    NoumenaWorkspaceSource,
    'repo' | 'raw_workspace_name' | 'workspace_state' | 'workspace_version'
  >,
): string {
  const base = `${workspaceSource.repo} · ${workspaceSource.raw_workspace_name}`
  const versionSuffix =
    typeof workspaceSource.workspace_version === 'number'
      ? ` @ v${workspaceSource.workspace_version}`
      : ''
  const stateSuffix = workspaceSource.workspace_state
    ? ` (${workspaceSource.workspace_state})`
    : ''
  return `${base}${versionSuffix}${stateSuffix}`
}

export function getSessionRepoRef(sessionContext: {
  sources: SessionContextSource[]
}): { owner: string; name: string } | null {
  const gitSource = getGitSourceFromSessionContext(sessionContext)
  if (gitSource?.url) {
    const repoPath = parseGitHubRepository(gitSource.url)
    if (repoPath) {
      const [owner, name] = repoPath.split('/')
      if (owner && name) {
        return { owner, name }
      }
    }
  }

  const workspaceSource =
    getNoumenaWorkspaceSourceFromSessionContext(sessionContext)
  if (!workspaceSource) {
    return null
  }

  const [owner, name] = workspaceSource.repo.split('/')
  if (!owner || !name) {
    return null
  }

  return { owner, name }
}

export function getSessionRepoDisplay(sessionContext: {
  sources: SessionContextSource[]
}): string | undefined {
  const workspaceSource =
    getNoumenaWorkspaceSourceFromSessionContext(sessionContext)
  if (workspaceSource) {
    return formatNoumenaWorkspaceDisplay(workspaceSource)
  }

  const gitSource = getGitSourceFromSessionContext(sessionContext)
  return gitSource?.url
}

/**
 * Content for a remote session message.
 * Accepts a plain string or an array of content blocks (text, image, etc.)
 * following the Anthropic API messages spec.
 */
export type RemoteMessageContent =
  | string
  | Array<{ type: string; [key: string]: unknown }>

/**
 * Sends a user message event to an existing remote session via the Sessions API
 * @param sessionId The session ID to send the event to
 * @param messageContent The user message content (string or content blocks)
 * @param opts.uuid Optional UUID for the event — callers that added a local
 *   UserMessage first should pass its UUID so echo filtering can dedup
 * @returns Promise<boolean> True if successful, false otherwise
 */
export async function sendEventToRemoteSession(
  sessionId: string,
  messageContent: RemoteMessageContent,
  opts?: { uuid?: string },
): Promise<boolean> {
  try {
    const { accessToken, orgUUID } = await prepareApiRequest()

    const url = buildNoumenaPlatformUrl(`/v1/sessions/${sessionId}/events`)
    const headers = {
      ...getOAuthHeaders(accessToken),
      'anthropic-beta': 'ccr-byoc-2025-07-29',
      'x-organization-uuid': orgUUID,
    }

    const userEvent = {
      uuid: opts?.uuid ?? randomUUID(),
      session_id: sessionId,
      type: 'user',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: messageContent,
      },
    }

    const requestBody = {
      events: [userEvent],
    }

    logForDebugging(
      `[sendEventToRemoteSession] Sending event to session ${sessionId}`,
    )
    // The endpoint may block until the CCR worker is ready. Observed ~2.6s
    // in normal cases; allow a generous margin for cold-start containers.
    const response = await axios.post(url, requestBody, {
      headers,
      validateStatus: status => status < 500,
      timeout: 30000,
    })

    if (response.status === 200 || response.status === 201) {
      logForDebugging(
        `[sendEventToRemoteSession] Successfully sent event to session ${sessionId}`,
      )
      return true
    }

    logForDebugging(
      `[sendEventToRemoteSession] Failed with status ${response.status}: ${jsonStringify(response.data)}`,
    )
    return false
  } catch (error) {
    logForDebugging(`[sendEventToRemoteSession] Error: ${errorMessage(error)}`)
    return false
  }
}

/**
 * Updates the title of an existing remote session via the Sessions API
 * @param sessionId The session ID to update
 * @param title The new title for the session
 * @returns Promise<boolean> True if successful, false otherwise
 */
export async function updateSessionTitle(
  sessionId: string,
  title: string,
): Promise<boolean> {
  try {
    const { accessToken, orgUUID } = await prepareApiRequest()

    const url = buildNoumenaPlatformUrl(`/v1/sessions/${sessionId}`)
    const headers = {
      ...getOAuthHeaders(accessToken),
      'anthropic-beta': 'ccr-byoc-2025-07-29',
      'x-organization-uuid': orgUUID,
    }

    logForDebugging(
      `[updateSessionTitle] Updating title for session ${sessionId}: "${title}"`,
    )
    const response = await axios.patch(
      url,
      { title },
      {
        headers,
        validateStatus: status => status < 500,
      },
    )

    if (response.status === 200) {
      logForDebugging(
        `[updateSessionTitle] Successfully updated title for session ${sessionId}`,
      )
      return true
    }

    logForDebugging(
      `[updateSessionTitle] Failed with status ${response.status}: ${jsonStringify(response.data)}`,
    )
    return false
  } catch (error) {
    logForDebugging(`[updateSessionTitle] Error: ${errorMessage(error)}`)
    return false
  }
}
