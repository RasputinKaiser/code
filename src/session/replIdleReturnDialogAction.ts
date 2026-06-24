export type ReplIdleReturnDialogPendingState = {
  input: string
  idleMinutes: number
}

export async function dispatchReplIdleReturnDialogAction(
  {
    action,
    pending,
  }: {
    action: 'dismiss' | 'never' | 'clear'
    pending: ReplIdleReturnDialogPendingState
  },
  {
    closeDialog,
    logIdleReturnAction,
    restorePendingInput,
    persistNeverDismiss,
    clearConversation,
    resetClearedConversationLocalState,
    markSkipIdleCheck,
    resubmitPendingInput,
  }: {
    closeDialog: () => void
    logIdleReturnAction: (
      action: 'dismiss' | 'never' | 'clear',
      idleMinutes: number,
    ) => void
    restorePendingInput: (input: string) => void
    persistNeverDismiss: () => void
    clearConversation: () => Promise<void>
    resetClearedConversationLocalState: () => void
    markSkipIdleCheck: () => void
    resubmitPendingInput: (input: string) => void
  },
): Promise<void> {
  closeDialog()
  logIdleReturnAction(action, Math.round(pending.idleMinutes))

  if (action === 'dismiss') {
    restorePendingInput(pending.input)
    return
  }

  if (action === 'never') {
    persistNeverDismiss()
  }

  if (action === 'clear') {
    await clearConversation()
    resetClearedConversationLocalState()
  }

  markSkipIdleCheck()
  resubmitPendingInput(pending.input)
}
