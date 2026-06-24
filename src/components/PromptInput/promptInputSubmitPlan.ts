import type { PromptInputMode } from '../../types/textInputTypes.js'
import type { PromptSuggestionStateSnapshot } from './promptInputSuggestionController.js'
import {
  resolvePromptSuggestionSubmitIntent,
  shouldLogPromptSuggestionOutcome,
  type PromptSuggestionSubmitIntent,
} from './promptInputSuggestionController.js'
import type { SuggestionItem } from './PromptInputFooterSuggestions.js'

export type PromptInputSubmitPlan =
  | {
      kind: 'blocked'
      reason:
        | 'footer_selected'
        | 'selecting_agent'
        | 'empty_without_images'
        | 'suggestions_open'
    }
  | {
      kind: 'proceed'
      inputToSubmit: string
      promptSuggestionIntent: PromptSuggestionSubmitIntent
      shouldLogPromptSuggestionOutcome: boolean
    }

type ResolvePromptInputSubmitPlanParams = {
  inputParam: string
  inputMode: PromptInputMode
  footerSelectionVisible: boolean
  viewSelectionMode: string | null | undefined
  hasImages: boolean
  suggestions: readonly SuggestionItem[]
  isSubmittingSlashCommand: boolean
  promptSuggestionState: PromptSuggestionStateSnapshot
  viewingAgentTaskId: string | null | undefined
  speculationStatus: string
}

export function resolvePromptInputSubmitPlan({
  inputParam,
  inputMode,
  footerSelectionVisible,
  viewSelectionMode,
  hasImages,
  suggestions,
  isSubmittingSlashCommand,
  promptSuggestionState,
  viewingAgentTaskId,
  speculationStatus,
}: ResolvePromptInputSubmitPlanParams): PromptInputSubmitPlan {
  if (footerSelectionVisible) {
    return {
      kind: 'blocked',
      reason: 'footer_selected',
    }
  }

  if (viewSelectionMode === 'selecting-agent') {
    return {
      kind: 'blocked',
      reason: 'selecting_agent',
    }
  }

  const promptSuggestionIntent = resolvePromptSuggestionSubmitIntent({
    inputParam,
    hasImages,
    promptSuggestionState,
    viewingAgentTaskId,
    speculationStatus,
  })
  const inputToSubmit = promptSuggestionIntent.inputToSubmit

  if (inputToSubmit.trim() === '' && !hasImages && inputMode !== 'bash') {
    return {
      kind: 'blocked',
      reason: 'empty_without_images',
    }
  }

  const hasDirectorySuggestions =
    suggestions.length > 0 &&
    suggestions.every(suggestion => suggestion.description === 'directory')
  if (
    suggestions.length > 0 &&
    !isSubmittingSlashCommand &&
    !hasDirectorySuggestions
  ) {
    return {
      kind: 'blocked',
      reason: 'suggestions_open',
    }
  }

  return {
    kind: 'proceed',
    inputToSubmit,
    promptSuggestionIntent,
    shouldLogPromptSuggestionOutcome:
      shouldLogPromptSuggestionOutcome(promptSuggestionState),
  }
}
