import { feature } from 'bun:bundle'

import type { AppState } from '../state/AppState.js'
import type { UserMessage } from '../types/message.js'
import { buildPermissionUpdates } from '../components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.js'
import { applyPermissionUpdates } from '../utils/permissions/PermissionUpdate.js'
import { stripDangerousPermissionsForAutoMode } from '../utils/permissions/permissionSetup.js'
import type { SetAppState } from '../utils/messageQueueManager.js'

export type ReplInitialMessage = NonNullable<AppState['initialMessage']>

export type ReplInitialMessageDispatchDeps = {
  clearConversation: () => Promise<void>
  readCurrentPlanSlug: () => string | undefined
  restorePlanSlug: (slug: string) => void
  resetLocalConversationState: () => void
  setAppState: SetAppState
  maybeSnapshotFileHistory: (uuid: string) => void
  awaitPendingHooks: () => Promise<void>
  submitInitialPrompt: (content: string) => void
  startDirectInitialQuery: (message: UserMessage) => void
  scheduleReset: () => void
}

export async function dispatchReplInitialMessage(
  initialMsg: ReplInitialMessage,
  {
    clearConversation,
    readCurrentPlanSlug,
    restorePlanSlug,
    resetLocalConversationState,
    setAppState,
    maybeSnapshotFileHistory,
    awaitPendingHooks,
    submitInitialPrompt,
    startDirectInitialQuery,
    scheduleReset,
  }: ReplInitialMessageDispatchDeps,
): Promise<void> {
  if (initialMsg.clearContext) {
    const oldPlanSlug = initialMsg.message.planContent
      ? readCurrentPlanSlug()
      : undefined

    await clearConversation()
    resetLocalConversationState()

    if (oldPlanSlug) {
      restorePlanSlug(oldPlanSlug)
    }
  }

  const shouldStorePlanForVerification =
    !!initialMsg.message.planContent &&
    process.env.CLAUDE_CODE_VERIFY_PLAN === 'true'

  setAppState(prev => {
    let updatedToolPermissionContext = initialMsg.mode
      ? applyPermissionUpdates(
          prev.toolPermissionContext,
          buildPermissionUpdates(initialMsg.mode, initialMsg.allowedPrompts),
        )
      : prev.toolPermissionContext

    if (feature('TRANSCRIPT_CLASSIFIER') && initialMsg.mode === 'auto') {
      updatedToolPermissionContext = stripDangerousPermissionsForAutoMode({
        ...updatedToolPermissionContext,
        mode: 'auto',
        prePlanMode: undefined,
      })
    }

    return {
      ...prev,
      initialMessage: null,
      toolPermissionContext: updatedToolPermissionContext,
      ...(shouldStorePlanForVerification && {
        pendingPlanVerification: {
          plan: initialMsg.message.planContent!,
          verificationStarted: false,
          verificationCompleted: false,
        },
      }),
    }
  })

  maybeSnapshotFileHistory(initialMsg.message.uuid)
  await awaitPendingHooks()

  const content = initialMsg.message.message.content
  if (typeof content === 'string' && !initialMsg.message.planContent) {
    submitInitialPrompt(content)
  } else {
    startDirectInitialQuery(initialMsg.message)
  }

  scheduleReset()
}
