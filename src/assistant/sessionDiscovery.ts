import type {
  ListSessionsResponse,
  SessionResource,
  SessionStatus,
} from '../utils/teleport/api.js'
import { buildNoumenaPlatformUrl } from '../utils/platformUrls.js'
import {
  CCR_BYOC_BETA,
  axiosGetWithRetry,
  getNoumenaWorkspaceSourceFromSessionContext,
  getSessionRepoDisplay,
  getOAuthHeaders,
  prepareApiRequest,
} from '../utils/teleport/api.js'

export type AssistantSession = {
  id: string
  title: string
  status: SessionStatus
  createdAt: string
  updatedAt: string
  repoPath?: string
  workerType?: string
  workspaceId?: string
  workspaceName?: string
  workspaceState?: string
}

type AssistantSessionResource = SessionResource & {
  metadata?: {
    worker_type?: string | null
  }
}

type AssistantListSessionsResponse = Omit<ListSessionsResponse, 'data'> & {
  data: AssistantSessionResource[]
}

function getRepoPath(session: AssistantSessionResource): string | undefined {
  return getSessionRepoDisplay(session.session_context)
}

function toAssistantSession(
  session: AssistantSessionResource,
): AssistantSession {
  const workspaceSource = getNoumenaWorkspaceSourceFromSessionContext(
    session.session_context,
  )

  return {
    id: session.id,
    title: session.title?.trim() || 'Untitled session',
    status: session.session_status,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    repoPath: getRepoPath(session),
    workerType: session.metadata?.worker_type ?? undefined,
    workspaceId: workspaceSource?.workspace_id,
    workspaceName: workspaceSource?.raw_workspace_name,
    workspaceState: workspaceSource?.workspace_state,
  }
}

export async function discoverAssistantSessions(): Promise<AssistantSession[]> {
  const { accessToken, orgUUID } = await prepareApiRequest()
  const url = buildNoumenaPlatformUrl('/v1/sessions')
  const response = await axiosGetWithRetry<AssistantListSessionsResponse>(url, {
    headers: {
      ...getOAuthHeaders(accessToken),
      'anthropic-beta': CCR_BYOC_BETA,
      'x-organization-uuid': orgUUID,
    },
    timeout: 15_000,
    validateStatus: status => status < 500,
  })

  if (response.status !== 200) {
    throw new Error(`Failed to discover sessions: HTTP ${response.status}`)
  }

  const sessions = Array.isArray(response.data.data) ? response.data.data : []
  const activeSessions = sessions.filter(
    session => session.session_status !== 'archived',
  )

  const taggedSessions = activeSessions.filter(
    session => session.metadata?.worker_type === 'claude_code_assistant',
  )

  const selectedSessions =
    taggedSessions.length > 0 ? taggedSessions : activeSessions

  return selectedSessions
    .map(toAssistantSession)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
