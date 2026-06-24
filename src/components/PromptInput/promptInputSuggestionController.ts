import type { PromptInputMode } from '../../types/textInputTypes.js'

export type PromptSuggestionStateSnapshot = {
  text: string | null
  shownAt: number
}

export type PromptSuggestionRenderState = {
  showPromptSuggestion: boolean
  shouldMarkShown: boolean
  shouldSuppressTiming: boolean
}

export type PromptSuggestionSubmitIntent =
  | {
      kind: 'none'
      inputToSubmit: string
    }
  | {
      kind: 'accept-suggestion'
      inputToSubmit: string
    }
  | {
      kind: 'accept-speculation'
      inputToSubmit: string
    }

type PromptSuggestionRenderStateInput = {
  mode: PromptInputMode
  suggestionsCount: number
  promptSuggestion: string | null
  promptSuggestionState: PromptSuggestionStateSnapshot
  viewingAgentTaskId: string | null | undefined
}

type PromptSuggestionSubmitIntentInput = {
  inputParam: string
  hasImages: boolean
  promptSuggestionState: PromptSuggestionStateSnapshot
  viewingAgentTaskId: string | null | undefined
  speculationStatus: string
}

export function derivePromptSuggestionRenderState({
  mode,
  suggestionsCount,
  promptSuggestion,
  promptSuggestionState,
  viewingAgentTaskId,
}: PromptSuggestionRenderStateInput): PromptSuggestionRenderState {
  const showPromptSuggestion =
    mode === 'prompt' &&
    suggestionsCount === 0 &&
    !!promptSuggestion &&
    !viewingAgentTaskId

  return {
    showPromptSuggestion,
    shouldMarkShown: showPromptSuggestion,
    shouldSuppressTiming:
      !!promptSuggestionState.text &&
      !promptSuggestion &&
      promptSuggestionState.shownAt === 0 &&
      !viewingAgentTaskId,
  }
}

export function resolvePromptSuggestionSubmitIntent({
  inputParam,
  hasImages,
  promptSuggestionState,
  viewingAgentTaskId,
  speculationStatus,
}: PromptSuggestionSubmitIntentInput): PromptSuggestionSubmitIntent {
  const suggestionText = promptSuggestionState.text
  const inputMatchesSuggestion =
    inputParam.trim() === '' || inputParam === suggestionText

  if (
    inputMatchesSuggestion &&
    suggestionText &&
    !hasImages &&
    !viewingAgentTaskId
  ) {
    if (speculationStatus === 'active') {
      return {
        kind: 'accept-speculation',
        inputToSubmit: suggestionText,
      }
    }

    if (promptSuggestionState.shownAt > 0) {
      return {
        kind: 'accept-suggestion',
        inputToSubmit: suggestionText,
      }
    }
  }

  return {
    kind: 'none',
    inputToSubmit: inputParam,
  }
}

export function shouldLogPromptSuggestionOutcome(
  promptSuggestionState: PromptSuggestionStateSnapshot,
): boolean {
  return !!promptSuggestionState.text && promptSuggestionState.shownAt > 0
}
