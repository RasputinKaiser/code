import type { PromptInputMode } from '../types/textInputTypes.js'

export type ResolveReplSubmitStateInput = {
  input: string
  inputMode: PromptInputMode
  isLoading: boolean
  isRemoteMode: boolean
  hasSpeculationAccept: boolean
  fromKeybinding: boolean
  hasStashedPrompt: boolean
}

export type ReplSubmitState = {
  isSlashCommand: boolean
  submitsNow: boolean
  shouldAddToHistory: boolean
  shouldRestoreStashImmediately: boolean
  shouldProvideDeferredStashRestore: boolean
  shouldClearInputValue: boolean
  shouldClearPastedContents: boolean
  shouldResetInputMode: boolean
  shouldIncrementSubmitCount: boolean
  shouldClearBuffer: boolean
  shouldShowProcessingPlaceholder: boolean
}

export function resolveReplSubmitState({
  input,
  inputMode,
  isLoading,
  isRemoteMode,
  hasSpeculationAccept,
  fromKeybinding,
  hasStashedPrompt,
}: ResolveReplSubmitStateInput): ReplSubmitState {
  const isSlashCommand = !hasSpeculationAccept && input.trim().startsWith('/')
  const submitsNow = !isLoading || hasSpeculationAccept || isRemoteMode
  const shouldRestoreStashImmediately =
    hasStashedPrompt && !isSlashCommand && submitsNow

  return {
    isSlashCommand,
    submitsNow,
    shouldAddToHistory: !fromKeybinding,
    shouldRestoreStashImmediately,
    // Preserve the current leader-submit contract exactly. In remote mode this
    // callback is ignored, but the existing REPL still builds it.
    shouldProvideDeferredStashRestore:
      hasStashedPrompt && (isSlashCommand || isLoading),
    shouldClearInputValue:
      submitsNow && !shouldRestoreStashImmediately && !fromKeybinding,
    shouldClearPastedContents: submitsNow && !shouldRestoreStashImmediately,
    shouldResetInputMode: submitsNow,
    shouldIncrementSubmitCount: submitsNow,
    shouldClearBuffer: submitsNow,
    shouldShowProcessingPlaceholder:
      submitsNow &&
      !isSlashCommand &&
      inputMode === 'prompt' &&
      !hasSpeculationAccept &&
      !isRemoteMode,
  }
}
