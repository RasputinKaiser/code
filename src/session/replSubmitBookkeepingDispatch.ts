import type { PromptInputMode } from '../types/textInputTypes.js'
import type { PastedContent } from '../utils/config.js'
import type { ReplSubmitBookkeepingPlan } from './replSubmitBookkeepingPlan.js'
import type { ReplSubmitState } from './replSubmitState.js'

export type ReplSubmitBookkeepingDispatchDeps = {
  addToHistory: (
    entry: NonNullable<ReplSubmitBookkeepingPlan['historyEntry']>,
  ) => void
  prependToShellHistoryCache: (command: string) => void
  setInputValue: (value: string) => void
  setCursorOffset: (offset: number) => void
  clearStashedPrompt: () => void
  setPastedContents: (value: Record<number, PastedContent>) => void
  setInputMode: (mode: PromptInputMode) => void
  clearIDESelection: () => void
  incrementSubmitCount: () => void
  clearBuffer: () => void
  resetTipPickedThisTurn: () => void
  setUserInputOnProcessing: (value: string) => void
  resetTimingRefs: () => void
  applyCommitAttribution: () => void
}

export function dispatchReplSubmitBookkeeping(
  {
    input,
    inputMode,
    submitState,
    submitBookkeepingPlan,
  }: {
    input: string
    inputMode: PromptInputMode
    submitState: ReplSubmitState
    submitBookkeepingPlan: ReplSubmitBookkeepingPlan
  },
  {
    addToHistory,
    prependToShellHistoryCache,
    setInputValue,
    setCursorOffset,
    clearStashedPrompt,
    setPastedContents,
    setInputMode,
    clearIDESelection,
    incrementSubmitCount,
    clearBuffer,
    resetTipPickedThisTurn,
    setUserInputOnProcessing,
    resetTimingRefs,
    applyCommitAttribution,
  }: ReplSubmitBookkeepingDispatchDeps,
): void {
  if (submitBookkeepingPlan.historyEntry) {
    addToHistory(submitBookkeepingPlan.historyEntry)
    if (inputMode === 'bash') {
      prependToShellHistoryCache(input.trim())
    }
  }

  if (submitBookkeepingPlan.inputValueUpdate.kind === 'restore') {
    setInputValue(submitBookkeepingPlan.inputValueUpdate.value)
    setCursorOffset(submitBookkeepingPlan.inputValueUpdate.cursorOffset)
    clearStashedPrompt()
  } else if (submitBookkeepingPlan.inputValueUpdate.kind === 'clear') {
    setInputValue(submitBookkeepingPlan.inputValueUpdate.value)
    setCursorOffset(submitBookkeepingPlan.inputValueUpdate.cursorOffset)
  }

  if (submitBookkeepingPlan.pastedContentsUpdate.kind === 'restore') {
    setPastedContents(submitBookkeepingPlan.pastedContentsUpdate.value)
  } else if (submitBookkeepingPlan.pastedContentsUpdate.kind === 'clear') {
    setPastedContents(submitBookkeepingPlan.pastedContentsUpdate.value)
  }

  if (!submitState.shouldResetInputMode) {
    return
  }

  setInputMode('prompt')
  clearIDESelection()
  if (submitState.shouldIncrementSubmitCount) {
    incrementSubmitCount()
  }
  if (submitState.shouldClearBuffer) {
    clearBuffer()
  }
  resetTipPickedThisTurn()

  if (submitState.shouldShowProcessingPlaceholder) {
    setUserInputOnProcessing(input)
    resetTimingRefs()
  }

  applyCommitAttribution()
}
