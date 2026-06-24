import { shouldTrackPromptInputActivity } from './replPromptInputActivityGate.js'

export function resolveEffectivePromptInputActivity(state: {
  isPromptInputActive: boolean
  currentDraft: string
  sandboxPermissionRequest: unknown
  toolUseConfirmRequest: unknown
  promptRequest: unknown
  workerSandboxPermissionRequest: unknown
  elicitationRequest: unknown
  showingCostDialog: boolean
}): boolean {
  if (!shouldTrackPromptInputActivity(state)) {
    return false
  }

  return state.isPromptInputActive || state.currentDraft.trim().length > 0
}
