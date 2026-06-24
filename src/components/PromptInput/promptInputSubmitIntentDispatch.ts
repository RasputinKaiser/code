import type { ActiveSpeculationState } from '../../services/PromptSuggestion/speculation.js'
import type { PromptInputHelpers } from '../../utils/handlePromptSubmit.js'
import type { SetAppState } from '../../state/AppState.js'
import type { PromptSuggestionSubmitIntent } from './promptInputSubmitPlan.js'

export type DispatchPromptInputSubmitIntentOptions = {
  inputToSubmit: string
  intent: PromptSuggestionSubmitIntent
  helpers: PromptInputHelpers
  speculation: ActiveSpeculationState
  speculationSessionTimeSavedMs: number
  setAppState: SetAppState
}

export type DispatchPromptInputSubmitIntentDeps = {
  markAccepted: () => void
  logOutcomeAtSubmission: (
    input: string,
    options?: {
      skipReset?: boolean
    },
  ) => void
  onSubmitProp: (
    input: string,
    helpers: PromptInputHelpers,
    speculationAccept?: {
      state: ActiveSpeculationState
      speculationSessionTimeSavedMs: number
      setAppState: SetAppState
    },
  ) => Promise<void>
}

export type PromptInputSubmitIntentDispatchResult =
  | {
      handled: true
    }
  | {
      handled: false
      nextInput: string
    }

export async function dispatchPromptInputSubmitIntent(
  {
    inputToSubmit,
    intent,
    helpers,
    speculation,
    speculationSessionTimeSavedMs,
    setAppState,
  }: DispatchPromptInputSubmitIntentOptions,
  { markAccepted, logOutcomeAtSubmission, onSubmitProp }: DispatchPromptInputSubmitIntentDeps,
): Promise<PromptInputSubmitIntentDispatchResult> {
  if (intent.kind === 'accept-speculation') {
    markAccepted()
    // skipReset preserves the existing contract where accepting speculation
    // does not clear the speculation before handing it to onSubmitProp.
    logOutcomeAtSubmission(inputToSubmit, {
      skipReset: true,
    })
    await onSubmitProp(
      inputToSubmit,
      helpers,
      {
        state: speculation,
        speculationSessionTimeSavedMs,
        setAppState,
      },
    )
    return {
      handled: true,
    }
  }

  if (intent.kind === 'accept-suggestion') {
    markAccepted()
    return {
      handled: false,
      nextInput: inputToSubmit,
    }
  }

  return {
    handled: false,
    nextInput: inputToSubmit,
  }
}
