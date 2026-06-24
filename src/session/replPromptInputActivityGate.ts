export function shouldTrackPromptInputActivity(state: {
  sandboxPermissionRequest: unknown
  toolUseConfirmRequest: unknown
  promptRequest: unknown
  workerSandboxPermissionRequest: unknown
  elicitationRequest: unknown
  showingCostDialog: boolean
}): boolean {
  return !!(
    state.sandboxPermissionRequest ||
    state.toolUseConfirmRequest ||
    state.promptRequest ||
    state.workerSandboxPermissionRequest ||
    state.elicitationRequest ||
    state.showingCostDialog
  )
}
