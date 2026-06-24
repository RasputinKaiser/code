import { describe, expect, it } from 'bun:test'
import type {
  NoumenaWorkspaceSource,
  SessionResource,
} from './api.js'
import {
  formatNoumenaWorkspaceDisplay,
  getSessionRepoDisplay,
} from './api.js'
import { validateSessionResumeTarget } from './sessionResumeValidation.js'

function makeWorkspace(
  overrides: Partial<NoumenaWorkspaceSource> = {},
): NoumenaWorkspaceSource {
  return {
    type: 'noumena_workspace',
    workspace_id: 'workspace-1',
    repo: 'noumena/ncode',
    raw_workspace_name: 'ws.alpha',
    checkout_path: '/tmp/ncode.dev',
    workspace_state: 'live',
    workspace_version: 221,
    ...overrides,
  }
}

function makeSession(overrides?: {
  sources?: SessionResource['session_context']['sources']
  outcomes?: SessionResource['session_context']['outcomes']
}): SessionResource {
  return {
    type: 'session',
    id: 'session-1',
    title: 'Test session',
    session_status: 'idle',
    environment_id: 'env-1',
    created_at: '2026-04-21T00:00:00Z',
    updated_at: '2026-04-21T00:00:00Z',
    session_context: {
      sources:
        overrides?.sources ??
        [
          makeWorkspace(),
          {
            type: 'git_repository',
            url: 'https://github.com/noumena/ncode',
            revision: 'main',
          },
        ],
      outcomes: overrides?.outcomes ?? null,
      cwd: '/workspace',
      custom_system_prompt: null,
      append_system_prompt: null,
      model: null,
    },
  }
}

describe('teleport session helpers', () => {
  it('formats workspace-backed session display using repo and workspace name', () => {
    expect(getSessionRepoDisplay(makeSession().session_context)).toBe(
      'noumena/ncode · ws.alpha @ v221 (live)',
    )
  })

  it('falls back to git url when no workspace source exists', () => {
    const session = makeSession({
      sources: [
        {
          type: 'git_repository',
          url: 'https://github.com/noumena/ncode',
          revision: 'main',
        },
      ],
    })

    expect(getSessionRepoDisplay(session.session_context)).toBe(
      'https://github.com/noumena/ncode',
    )
  })

  it('validates workspace-bound sessions against the current workspace identity', () => {
    const result = validateSessionResumeTarget(makeSession(), {
      currentRepo: null,
      currentWorkspace: makeWorkspace(),
    })

    expect(result).toMatchObject({
      status: 'match',
      sessionRepo: 'noumena/ncode',
      currentRepo: 'noumena/ncode',
      sessionWorkspace: 'noumena/ncode · ws.alpha @ v221 (live)',
      currentWorkspace: 'noumena/ncode · ws.alpha @ v221 (live)',
      sessionWorkspaceVersion: 221,
      currentWorkspaceVersion: 221,
    })
  })

  it('requires the matching workspace for workspace-bound sessions', () => {
    const result = validateSessionResumeTarget(makeSession(), {
      currentRepo: {
        host: 'github.com',
        owner: 'noumena',
        name: 'ncode',
      },
      currentWorkspace: null,
    })

    expect(result).toMatchObject({
      status: 'workspace_required',
      sessionWorkspace: 'noumena/ncode · ws.alpha @ v221 (live)',
      currentWorkspace: null,
    })
  })

  it('detects workspace mismatches even when the repo is the same', () => {
    const result = validateSessionResumeTarget(makeSession(), {
      currentRepo: null,
      currentWorkspace: makeWorkspace({
        workspace_id: 'workspace-2',
        raw_workspace_name: 'ws.beta',
        workspace_state: 'attached',
      }),
    })

    expect(result).toMatchObject({
      status: 'workspace_mismatch',
      sessionWorkspace: 'noumena/ncode · ws.alpha @ v221 (live)',
      currentWorkspace: 'noumena/ncode · ws.beta @ v221 (attached)',
      sessionWorkspaceVersion: 221,
      currentWorkspaceVersion: 221,
    })
  })

  it('requires sync when the current workspace version is behind the session workspace version', () => {
    const result = validateSessionResumeTarget(
      makeSession({
        sources: [
          makeWorkspace({ workspace_version: 221 }),
          {
            type: 'git_repository',
            url: 'https://github.com/noumena/ncode',
            revision: 'main',
          },
        ],
      }),
      {
        currentRepo: null,
        currentWorkspace: makeWorkspace({ workspace_version: 219 }),
      },
    )

    expect(result).toMatchObject({
      status: 'workspace_sync_required',
      sessionWorkspace: 'noumena/ncode · ws.alpha @ v221 (live)',
      currentWorkspace: 'noumena/ncode · ws.alpha @ v219 (live)',
      sessionWorkspaceVersion: 221,
      currentWorkspaceVersion: 219,
    })
  })

  it('allows resume but marks drift when the current workspace version has advanced', () => {
    const result = validateSessionResumeTarget(
      makeSession({
        sources: [
          makeWorkspace({ workspace_version: 221 }),
          {
            type: 'git_repository',
            url: 'https://github.com/noumena/ncode',
            revision: 'main',
          },
        ],
      }),
      {
        currentRepo: null,
        currentWorkspace: makeWorkspace({ workspace_version: 223 }),
      },
    )

    expect(result).toMatchObject({
      status: 'match',
      sessionWorkspace: 'noumena/ncode · ws.alpha @ v221 (live)',
      currentWorkspace: 'noumena/ncode · ws.alpha @ v223 (live)',
      sessionWorkspaceVersion: 221,
      currentWorkspaceVersion: 223,
      workspaceVersionDrift: 'advanced',
    })
  })

  it('falls back to repository validation for non-workspace sessions', () => {
    const session = makeSession({
      sources: [
        {
          type: 'git_repository',
          url: 'https://github.com/noumena/ncode',
          revision: 'main',
        },
      ],
    })

    expect(
      validateSessionResumeTarget(session, {
        currentRepo: {
          host: 'github.com',
          owner: 'noumena',
          name: 'ncode',
        },
        currentWorkspace: null,
      }),
    ).toMatchObject({
      status: 'match',
      sessionRepo: 'noumena/ncode',
      currentRepo: 'noumena/ncode',
    })
  })
})

describe('workspace display formatting', () => {
  it('omits workspace state when it is not present', () => {
    expect(
      formatNoumenaWorkspaceDisplay(
        makeWorkspace({ workspace_state: undefined }),
      ),
    ).toBe('noumena/ncode · ws.alpha @ v221')
  })

  it('omits workspace version when it is not present', () => {
    expect(
      formatNoumenaWorkspaceDisplay(
        makeWorkspace({ workspace_version: undefined }),
      ),
    ).toBe('noumena/ncode · ws.alpha (live)')
  })
})
