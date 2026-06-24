import type { PromptInputMode } from '../types/textInputTypes.js'
import type { PastedContent } from '../utils/config.js'
import { prependModeCharacterToInput } from '../components/PromptInput/inputModes.js'
import type { ReplSubmitState } from './replSubmitState.js'

export type ReplStashedPromptState = {
  text: string
  cursorOffset: number
  pastedContents: Record<number, PastedContent>
}

export type ReplSubmitBookkeepingPlan = {
  historyEntry:
    | {
        display: string
        pastedContents: Record<number, PastedContent>
      }
    | undefined
  inputValueUpdate:
    | {
        kind: 'none'
      }
    | {
        kind: 'clear'
        value: ''
        cursorOffset: 0
      }
    | {
        kind: 'restore'
        value: string
        cursorOffset: number
      }
  pastedContentsUpdate:
    | {
        kind: 'none'
      }
    | {
        kind: 'clear'
        value: Record<number, PastedContent>
      }
    | {
        kind: 'restore'
        value: Record<number, PastedContent>
      }
}

export function resolveReplSubmitBookkeepingPlan({
  submitState,
  input,
  inputMode,
  hasSpeculationAccept,
  pastedContents,
  stashedPrompt,
}: {
  submitState: ReplSubmitState
  input: string
  inputMode: PromptInputMode
  hasSpeculationAccept: boolean
  pastedContents: Record<number, PastedContent>
  stashedPrompt: ReplStashedPromptState | undefined
}): ReplSubmitBookkeepingPlan {
  const historyEntry = submitState.shouldAddToHistory
    ? {
        display: hasSpeculationAccept
          ? input
          : prependModeCharacterToInput(input, inputMode),
        pastedContents: hasSpeculationAccept ? {} : pastedContents,
      }
    : undefined

  if (submitState.shouldRestoreStashImmediately && stashedPrompt) {
    return {
      historyEntry,
      inputValueUpdate: {
        kind: 'restore',
        value: stashedPrompt.text,
        cursorOffset: stashedPrompt.cursorOffset,
      },
      pastedContentsUpdate: {
        kind: 'restore',
        value: stashedPrompt.pastedContents,
      },
    }
  }

  if (submitState.submitsNow) {
    return {
      historyEntry,
      inputValueUpdate: submitState.shouldClearInputValue
        ? {
            kind: 'clear',
            value: '',
            cursorOffset: 0,
          }
        : {
            kind: 'none',
          },
      pastedContentsUpdate: submitState.shouldClearPastedContents
        ? {
            kind: 'clear',
            value: {},
          }
        : {
            kind: 'none',
          },
    }
  }

  return {
    historyEntry,
    inputValueUpdate: {
      kind: 'none',
    },
    pastedContentsUpdate: {
      kind: 'none',
    },
  }
}
