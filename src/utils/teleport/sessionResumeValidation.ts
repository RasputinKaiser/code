import type { ParsedRepository } from '../detectRepository.js'
import type {
  NoumenaWorkspaceSource,
  SessionResource,
} from './api.js'
import {
  formatNoumenaWorkspaceDisplay,
  getGitSourceFromSessionContext,
  getNoumenaWorkspaceSourceFromSessionContext,
} from './api.js'
import { parseGitHubRepository, parseGitRemote } from '../detectRepository.js'

export type SessionResumeValidationResult = {
  status:
    | 'match'
    | 'mismatch'
    | 'not_in_repo'
    | 'no_repo_required'
    | 'workspace_required'
    | 'workspace_mismatch'
    | 'workspace_sync_required'
    | 'error'
  sessionRepo?: string
  currentRepo?: string | null
  sessionHost?: string
  currentHost?: string
  sessionWorkspace?: string
  currentWorkspace?: string | null
  sessionWorkspaceVersion?: number
  currentWorkspaceVersion?: number | null
  workspaceVersionDrift?: 'advanced'
  errorMessage?: string
}

function stripPort(host: string): string {
  return host.replace(/:\d+$/, '')
}

export function formatCurrentWorkspaceDisplay(
  workspaceSource: Pick<
    NoumenaWorkspaceSource,
    'repo' | 'raw_workspace_name' | 'workspace_state'
  >,
): string {
  return formatNoumenaWorkspaceDisplay(workspaceSource)
}

export function validateSessionResumeTarget(
  sessionData: SessionResource,
  {
    currentRepo,
    currentWorkspace,
  }: {
    currentRepo: ParsedRepository | null
    currentWorkspace: NoumenaWorkspaceSource | null
  },
): SessionResumeValidationResult {
  const sessionWorkspace = getNoumenaWorkspaceSourceFromSessionContext(
    sessionData.session_context,
  )

  if (sessionWorkspace) {
    const sessionWorkspaceDisplay =
      formatNoumenaWorkspaceDisplay(sessionWorkspace)
    const sessionWorkspaceVersion =
      typeof sessionWorkspace.workspace_version === 'number'
        ? sessionWorkspace.workspace_version
        : undefined

    if (!currentWorkspace) {
      return {
        status: 'workspace_required',
        sessionWorkspace: sessionWorkspaceDisplay,
        sessionRepo: sessionWorkspace.repo,
        currentWorkspace: null,
        sessionWorkspaceVersion,
      }
    }

    if (currentWorkspace.workspace_id !== sessionWorkspace.workspace_id) {
      return {
        status: 'workspace_mismatch',
        sessionWorkspace: sessionWorkspaceDisplay,
        currentWorkspace: formatCurrentWorkspaceDisplay(currentWorkspace),
        sessionRepo: sessionWorkspace.repo,
        currentRepo: currentWorkspace.repo,
        sessionWorkspaceVersion,
        currentWorkspaceVersion:
          typeof currentWorkspace.workspace_version === 'number'
            ? currentWorkspace.workspace_version
            : null,
      }
    }

    const currentWorkspaceVersion =
      typeof currentWorkspace.workspace_version === 'number'
        ? currentWorkspace.workspace_version
        : null

    if (
      sessionWorkspaceVersion !== undefined &&
      currentWorkspaceVersion !== null &&
      currentWorkspaceVersion < sessionWorkspaceVersion
    ) {
      return {
        status: 'workspace_sync_required',
        sessionRepo: sessionWorkspace.repo,
        currentRepo: currentWorkspace.repo,
        sessionWorkspace: sessionWorkspaceDisplay,
        currentWorkspace: formatCurrentWorkspaceDisplay(currentWorkspace),
        sessionWorkspaceVersion,
        currentWorkspaceVersion,
      }
    }

    return {
      status: 'match',
      sessionRepo: sessionWorkspace.repo,
      currentRepo: currentWorkspace.repo,
      sessionWorkspace: sessionWorkspaceDisplay,
      currentWorkspace: formatCurrentWorkspaceDisplay(currentWorkspace),
      sessionWorkspaceVersion,
      currentWorkspaceVersion,
      ...(sessionWorkspaceVersion !== undefined &&
        currentWorkspaceVersion !== null &&
        currentWorkspaceVersion > sessionWorkspaceVersion && {
          workspaceVersionDrift: 'advanced' as const,
        }),
    }
  }

  const gitSource = getGitSourceFromSessionContext(sessionData.session_context)
  if (!gitSource?.url) {
    return {
      status: 'no_repo_required',
    }
  }

  const sessionParsed = parseGitRemote(gitSource.url)
  const sessionRepo = sessionParsed
    ? `${sessionParsed.owner}/${sessionParsed.name}`
    : parseGitHubRepository(gitSource.url)

  if (!sessionRepo) {
    return {
      status: 'no_repo_required',
    }
  }

  const currentRepoRef = currentRepo
    ? `${currentRepo.owner}/${currentRepo.name}`
    : null

  if (!currentRepoRef) {
    return {
      status: 'not_in_repo',
      sessionRepo,
      currentRepo: null,
      sessionHost: sessionParsed?.host,
    }
  }

  const repoMatch = currentRepoRef.toLowerCase() === sessionRepo.toLowerCase()
  const hostMatch =
    !currentRepo ||
    !sessionParsed ||
    stripPort(currentRepo.host.toLowerCase()) ===
      stripPort(sessionParsed.host.toLowerCase())

  if (repoMatch && hostMatch) {
    return {
      status: 'match',
      sessionRepo,
      currentRepo: currentRepoRef,
      sessionHost: sessionParsed?.host,
      currentHost: currentRepo.host,
    }
  }

  return {
    status: 'mismatch',
    sessionRepo,
    currentRepo: currentRepoRef,
    sessionHost: sessionParsed?.host,
    currentHost: currentRepo.host,
  }
}
