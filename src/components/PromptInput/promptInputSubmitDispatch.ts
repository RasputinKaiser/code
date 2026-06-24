import type { SetAppState } from '../../state/AppState.js'
import type { PromptInputHelpers } from '../../utils/handlePromptSubmit.js'
import type { ActiveSpeculationState } from '../../services/PromptSuggestion/speculation.js'
import type { SuggestionItem } from './PromptInputFooterSuggestions.js'
import type { PromptSuggestionStateSnapshot } from './promptInputSuggestionController.js'
import { resolvePromptInputSubmitPlan } from './promptInputSubmitPlan.js'
import {
  dispatchPromptInputAgentRoute,
  dispatchPromptInputDirectMessageShortcut,
  type DispatchPromptInputAgentRouteDeps,
  type DispatchPromptInputAgentRouteOptions,
  type DispatchPromptInputDirectMessageShortcutDeps,
  type DispatchPromptInputDirectMessageShortcutOptions,
} from './promptInputSubmitRouteDispatch.js'
import {
  dispatchPromptInputSubmitIntent,
  type DispatchPromptInputSubmitIntentDeps,
} from './promptInputSubmitIntentDispatch.js'

import type { PromptInputMode } from '../../types/textInputTypes.js'
export type DispatchPromptInputSubmitOptions = {
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
  helpers: PromptInputHelpers
  speculation: ActiveSpeculationState
  speculationSessionTimeSavedMs: number
  setAppState: SetAppState
  swarmsEnabled: boolean
  teamContext: DispatchPromptInputDirectMessageShortcutOptions['teamContext']
  activeAgent: DispatchPromptInputAgentRouteOptions['activeAgent']
}

export type DispatchPromptInputSubmitDeps = {
  submitIntentDeps: DispatchPromptInputSubmitIntentDeps
  directMessageDeps: DispatchPromptInputDirectMessageShortcutDeps
  agentRouteDeps: DispatchPromptInputAgentRouteDeps
  removeNotification: (key: string) => void
  onSubmitProp: DispatchPromptInputSubmitIntentDeps['onSubmitProp']
  resolvePromptInputSubmitPlanImpl?: typeof resolvePromptInputSubmitPlan
  dispatchPromptInputSubmitIntentImpl?: typeof dispatchPromptInputSubmitIntent
  dispatchPromptInputDirectMessageShortcutImpl?: typeof dispatchPromptInputDirectMessageShortcut
  dispatchPromptInputAgentRouteImpl?: typeof dispatchPromptInputAgentRoute
}

export async function dispatchPromptInputSubmit(
  {
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
    helpers,
    speculation,
    speculationSessionTimeSavedMs,
    setAppState,
    swarmsEnabled,
    teamContext,
    activeAgent,
  }: DispatchPromptInputSubmitOptions,
  {
    submitIntentDeps,
    directMessageDeps,
    agentRouteDeps,
    removeNotification,
    onSubmitProp,
    resolvePromptInputSubmitPlanImpl = resolvePromptInputSubmitPlan,
    dispatchPromptInputSubmitIntentImpl = dispatchPromptInputSubmitIntent,
    dispatchPromptInputDirectMessageShortcutImpl = dispatchPromptInputDirectMessageShortcut,
    dispatchPromptInputAgentRouteImpl = dispatchPromptInputAgentRoute,
  }: DispatchPromptInputSubmitDeps,
): Promise<void> {
  const trimmedInput = inputParam.trimEnd()
  const submitPlan = resolvePromptInputSubmitPlanImpl({
    inputParam: trimmedInput,
    inputMode,
    footerSelectionVisible,
    viewSelectionMode,
    hasImages,
    suggestions,
    isSubmittingSlashCommand,
    promptSuggestionState,
    viewingAgentTaskId,
    speculationStatus,
  })

  if (submitPlan.kind === 'blocked') {
    return
  }

  const suggestionSubmitResult = await dispatchPromptInputSubmitIntentImpl(
    {
      inputToSubmit: submitPlan.inputToSubmit,
      intent: submitPlan.promptSuggestionIntent,
      helpers,
      speculation,
      speculationSessionTimeSavedMs,
      setAppState,
    },
    submitIntentDeps,
  )
  if (suggestionSubmitResult.handled) {
    return
  }

  const nextInput = suggestionSubmitResult.nextInput

  if (
    await dispatchPromptInputDirectMessageShortcutImpl(
      {
        input: nextInput,
        swarmsEnabled,
        teamContext,
      },
      directMessageDeps,
    )
  ) {
    return
  }

  if (submitPlan.shouldLogPromptSuggestionOutcome) {
    submitIntentDeps.logOutcomeAtSubmission(nextInput)
  }

  removeNotification('stash-hint')

  if (
    await dispatchPromptInputAgentRouteImpl(
      {
        input: nextInput,
        activeAgent,
      },
      agentRouteDeps,
    )
  ) {
    return
  }

  await onSubmitProp(nextInput, helpers)
}
