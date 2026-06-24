import { describe, expect, test } from 'bun:test'

import type { UUID } from 'crypto'

import { dispatchReplResumeSessionSwitch } from './replResumeSessionSwitchDispatch.js'

describe('dispatchReplResumeSessionSwitch', () => {
  test('preserves resume-session switch ordering and restores target costs last', async () => {
    const events: string[] = []
    const targetCosts = { totalCostUsd: 1.25 }

    await dispatchReplResumeSessionSwitch({
      sessionId: 'resume-session' as UUID,
      projectPath: '/tmp/project',
      log: {
        worktreeSession: {
          id: 'wt-1',
          originalCwd: '/tmp/project',
          parentCwd: '/tmp/project',
          branchName: 'main',
          createdAt: new Date().toISOString(),
        },
      } as any,
      entrypoint: 'cli_flag',
      getStoredSessionCosts: sessionId => {
        events.push(`read-costs:${sessionId}`)
        return targetCosts
      },
      saveCurrentSessionCosts: () => {
        events.push('save-current-costs')
      },
      resetCostState: () => {
        events.push('reset-cost-state')
      },
      switchSession: (sessionId, projectPath) => {
        events.push(`switch-session:${sessionId}:${projectPath}`)
      },
      renameRecordingForSession: async () => {
        events.push('rename-recording')
      },
      resetSessionFilePointer: async () => {
        events.push('reset-session-file-pointer')
      },
      clearSessionMetadata: () => {
        events.push('clear-session-metadata')
      },
      restoreSessionMetadata: () => {
        events.push('restore-session-metadata')
      },
      markHaikuTitleAttempted: () => {
        events.push('mark-haiku-title-attempted')
      },
      clearHaikuTitle: () => {
        events.push('clear-haiku-title')
      },
      exitRestoredWorktree: () => {
        events.push('exit-restored-worktree')
      },
      restoreWorktreeForResume: worktreeSession => {
        events.push(`restore-worktree:${Boolean(worktreeSession)}`)
      },
      adoptResumedSessionFile: () => {
        events.push('adopt-resumed-session-file')
      },
      restoreRemoteAgentTasks: ({ abortController }) => {
        events.push(`restore-remote-agent-tasks:${abortController instanceof AbortController}`)
      },
      createAbortController: () => new AbortController(),
      getAppState: () => ({}) as any,
      setAppState: updater => updater as any,
      getCurrentWorktreeSession: () => {
        events.push('get-current-worktree')
        return null
      },
      saveWorktreeState: () => {
        events.push('save-worktree-state')
      },
      shouldPersistCoordinatorMode: true,
      saveMode: mode => {
        events.push(`save-mode:${mode}`)
      },
      isCoordinatorMode: () => {
        events.push('is-coordinator-mode')
        return true
      },
      setCostStateForRestore: costs => {
        events.push(`restore-target-costs:${costs === targetCosts}`)
      },
    })

    expect(events).toEqual([
      'read-costs:resume-session',
      'save-current-costs',
      'reset-cost-state',
      'switch-session:resume-session:/tmp/project',
      'rename-recording',
      'reset-session-file-pointer',
      'clear-session-metadata',
      'restore-session-metadata',
      'mark-haiku-title-attempted',
      'clear-haiku-title',
      'exit-restored-worktree',
      'restore-worktree:true',
      'adopt-resumed-session-file',
      'restore-remote-agent-tasks:true',
      'is-coordinator-mode',
      'save-mode:coordinator',
      'restore-target-costs:true',
    ])
  })

  test('fork entrypoint re-persists current worktree and skips remote restore', async () => {
    const events: string[] = []

    await dispatchReplResumeSessionSwitch({
      sessionId: 'fork-session' as UUID,
      projectPath: null,
      log: {
        worktreeSession: null,
      } as any,
      entrypoint: 'fork',
      getStoredSessionCosts: () => undefined,
      saveCurrentSessionCosts: () => {
        events.push('save-current-costs')
      },
      resetCostState: () => {
        events.push('reset-cost-state')
      },
      switchSession: () => {
        events.push('switch-session')
      },
      renameRecordingForSession: async () => {
        events.push('rename-recording')
      },
      resetSessionFilePointer: async () => {
        events.push('reset-session-file-pointer')
      },
      clearSessionMetadata: () => {
        events.push('clear-session-metadata')
      },
      restoreSessionMetadata: () => {
        events.push('restore-session-metadata')
      },
      markHaikuTitleAttempted: () => {
        events.push('mark-haiku-title-attempted')
      },
      clearHaikuTitle: () => {
        events.push('clear-haiku-title')
      },
      exitRestoredWorktree: () => {
        events.push('exit-restored-worktree')
      },
      restoreWorktreeForResume: () => {
        events.push('restore-worktree')
      },
      adoptResumedSessionFile: () => {
        events.push('adopt-resumed-session-file')
      },
      restoreRemoteAgentTasks: () => {
        events.push('restore-remote-agent-tasks')
      },
      createAbortController: () => new AbortController(),
      getAppState: () => ({}) as any,
      setAppState: updater => updater as any,
      getCurrentWorktreeSession: () => {
        events.push('get-current-worktree')
        return 'current-worktree'
      },
      saveWorktreeState: worktreeSession => {
        events.push(`save-worktree-state:${worktreeSession}`)
      },
      shouldPersistCoordinatorMode: false,
      setCostStateForRestore: () => {
        events.push('restore-target-costs')
      },
    })

    expect(events).toEqual([
      'save-current-costs',
      'reset-cost-state',
      'switch-session',
      'rename-recording',
      'reset-session-file-pointer',
      'clear-session-metadata',
      'restore-session-metadata',
      'mark-haiku-title-attempted',
      'clear-haiku-title',
      'get-current-worktree',
      'save-worktree-state:current-worktree',
    ])
  })
})
