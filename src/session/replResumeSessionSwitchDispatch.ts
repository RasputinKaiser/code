import type { UUID } from 'crypto'

import type { ResumeEntrypoint } from '../types/command.js'
import type { LogOption } from '../types/logs.js'
import type { AppState } from '../state/AppStateStore.js'
import type { SetAppState } from '../utils/messageQueueManager.js'

export type ReplResumeSessionSwitchDispatchDeps = {
  sessionId: UUID
  projectPath: string | null
  log: LogOption
  entrypoint: ResumeEntrypoint
  getStoredSessionCosts: (sessionId: UUID) => unknown
  saveCurrentSessionCosts: () => void
  resetCostState: () => void
  switchSession: (sessionId: UUID, projectPath: string | null) => void
  renameRecordingForSession: () => Promise<void>
  resetSessionFilePointer: () => Promise<void>
  clearSessionMetadata: () => void
  restoreSessionMetadata: (log: LogOption) => void
  markHaikuTitleAttempted: () => void
  clearHaikuTitle: () => void
  exitRestoredWorktree: () => void
  restoreWorktreeForResume: (worktreeSession: LogOption['worktreeSession']) => void
  adoptResumedSessionFile: () => void
  restoreRemoteAgentTasks: (params: {
    abortController: AbortController
    getAppState: () => AppState
    setAppState: SetAppState
  }) => void
  createAbortController: () => AbortController
  getAppState: () => AppState
  setAppState: SetAppState
  getCurrentWorktreeSession: () => unknown
  saveWorktreeState: (worktreeSession: unknown) => void
  shouldPersistCoordinatorMode: boolean
  saveMode?: (mode: 'coordinator' | 'normal') => void
  isCoordinatorMode?: () => boolean
  setCostStateForRestore: (costs: unknown) => void
}

export async function dispatchReplResumeSessionSwitch({
  sessionId,
  projectPath,
  log,
  entrypoint,
  getStoredSessionCosts,
  saveCurrentSessionCosts,
  resetCostState,
  switchSession,
  renameRecordingForSession,
  resetSessionFilePointer,
  clearSessionMetadata,
  restoreSessionMetadata,
  markHaikuTitleAttempted,
  clearHaikuTitle,
  exitRestoredWorktree,
  restoreWorktreeForResume,
  adoptResumedSessionFile,
  restoreRemoteAgentTasks,
  createAbortController,
  getAppState,
  setAppState,
  getCurrentWorktreeSession,
  saveWorktreeState,
  shouldPersistCoordinatorMode,
  saveMode,
  isCoordinatorMode,
  setCostStateForRestore,
}: ReplResumeSessionSwitchDispatchDeps): Promise<void> {
  // Read the target session's costs before saving the current session;
  // saveCurrentSessionCosts overwrites the persisted state for the active one.
  const targetSessionCosts = getStoredSessionCosts(sessionId)

  saveCurrentSessionCosts()
  resetCostState()

  switchSession(sessionId, projectPath)
  await renameRecordingForSession()
  await resetSessionFilePointer()

  // restoreSessionMetadata is set-if-truthy, so clear first to avoid
  // leaking cached metadata from the previously active session.
  clearSessionMetadata()
  restoreSessionMetadata(log)
  markHaikuTitleAttempted()
  clearHaikuTitle()

  if (entrypoint !== 'fork') {
    exitRestoredWorktree()
    restoreWorktreeForResume(log.worktreeSession)
    adoptResumedSessionFile()
    restoreRemoteAgentTasks({
      abortController: createAbortController(),
      getAppState,
      setAppState,
    })
  } else {
    const worktreeSession = getCurrentWorktreeSession()
    if (worktreeSession) {
      saveWorktreeState(worktreeSession)
    }
  }

  if (shouldPersistCoordinatorMode && saveMode && isCoordinatorMode) {
    saveMode(isCoordinatorMode() ? 'coordinator' : 'normal')
  }

  if (targetSessionCosts) {
    setCostStateForRestore(targetSessionCosts)
  }
}
