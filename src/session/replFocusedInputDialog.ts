export type ReplFocusedInputDialog =
  | 'message-selector'
  | 'sandbox-permission'
  | 'tool-permission'
  | 'prompt'
  | 'worker-sandbox-permission'
  | 'elicitation'
  | 'cost'
  | 'idle-return'
  | 'init-onboarding'
  | 'ide-onboarding'
  | 'model-switch'
  | 'undercover-callout'
  | 'effort-callout'
  | 'remote-callout'
  | 'lsp-recommendation'
  | 'plugin-hint'
  | 'desktop-upsell'
  | 'ultraplan-choice'
  | 'ultraplan-launch'

export function resolveReplFocusedInputDialog(state: {
  isExiting: boolean
  exitFlow: unknown
  isMessageSelectorVisible: boolean
  isPromptInputActive: boolean
  sandboxPermissionRequest: unknown
  toolJSX: unknown
  toolJSXShouldContinueAnimation: boolean | undefined
  toolUseConfirmRequest: unknown
  promptRequest: unknown
  workerSandboxPermissionRequest: unknown
  elicitationRequest: unknown
  showingCostDialog: boolean
  idleReturnPending: unknown
  ultraplanEnabled: boolean
  isLoading: boolean
  ultraplanPendingChoice: unknown
  ultraplanLaunchPending: unknown
  showIdeOnboarding: boolean
  isAntUser: boolean
  showModelSwitchCallout: boolean
  showUndercoverCallout: boolean
  showEffortCallout: boolean
  showRemoteCallout: boolean
  lspRecommendation: unknown
  hintRecommendation: unknown
  showDesktopUpsellStartup: boolean
}): ReplFocusedInputDialog | undefined {
  if (state.isExiting || state.exitFlow) return undefined

  if (state.isMessageSelectorVisible) return 'message-selector'

  if (state.isPromptInputActive) return undefined
  if (state.sandboxPermissionRequest) return 'sandbox-permission'

  const allowDialogsWithAnimation =
    !state.toolJSX || state.toolJSXShouldContinueAnimation
  if (allowDialogsWithAnimation && state.toolUseConfirmRequest) {
    return 'tool-permission'
  }
  if (allowDialogsWithAnimation && state.promptRequest) return 'prompt'
  if (allowDialogsWithAnimation && state.workerSandboxPermissionRequest) {
    return 'worker-sandbox-permission'
  }
  if (allowDialogsWithAnimation && state.elicitationRequest) {
    return 'elicitation'
  }
  if (allowDialogsWithAnimation && state.showingCostDialog) return 'cost'
  if (allowDialogsWithAnimation && state.idleReturnPending) return 'idle-return'
  if (
    state.ultraplanEnabled &&
    allowDialogsWithAnimation &&
    !state.isLoading &&
    state.ultraplanPendingChoice
  ) {
    return 'ultraplan-choice'
  }
  if (
    state.ultraplanEnabled &&
    allowDialogsWithAnimation &&
    !state.isLoading &&
    state.ultraplanLaunchPending
  ) {
    return 'ultraplan-launch'
  }

  if (allowDialogsWithAnimation && state.showIdeOnboarding) {
    return 'ide-onboarding'
  }

  if (
    state.isAntUser &&
    allowDialogsWithAnimation &&
    state.showModelSwitchCallout
  ) {
    return 'model-switch'
  }
  if (
    state.isAntUser &&
    allowDialogsWithAnimation &&
    state.showUndercoverCallout
  ) {
    return 'undercover-callout'
  }

  if (allowDialogsWithAnimation && state.showEffortCallout) {
    return 'effort-callout'
  }
  if (allowDialogsWithAnimation && state.showRemoteCallout) {
    return 'remote-callout'
  }
  if (allowDialogsWithAnimation && state.lspRecommendation) {
    return 'lsp-recommendation'
  }
  if (allowDialogsWithAnimation && state.hintRecommendation) {
    return 'plugin-hint'
  }
  if (allowDialogsWithAnimation && state.showDesktopUpsellStartup) {
    return 'desktop-upsell'
  }

  return undefined
}

export function resolveReplHasSuppressedDialogs(state: {
  isPromptInputActive: boolean
  sandboxPermissionRequest: unknown
  toolUseConfirmRequest: unknown
  promptRequest: unknown
  workerSandboxPermissionRequest: unknown
  elicitationRequest: unknown
  showingCostDialog: boolean
}): unknown {
  return (
    state.isPromptInputActive &&
    (state.sandboxPermissionRequest ||
      state.toolUseConfirmRequest ||
      state.promptRequest ||
      state.workerSandboxPermissionRequest ||
      state.elicitationRequest ||
      state.showingCostDialog)
  )
}
