import type { PastedContent } from '../../utils/config.js'
import {
  resolvePromptInputChangePlan,
  type PromptInputChangePlan,
} from './promptInputChangePlan.js'

export type DispatchPromptInputChangeOptions = {
  value: string
  input: string
  cursorOffset: number
  pastedContents: Record<number, PastedContent>
}

export type DispatchPromptInputChangeDeps = {
  toggleHelp: () => void
  closeHelp: () => void
  dismissStashHint: () => void
  abortPromptSuggestion: () => void
  abortSpeculation: () => void
  onModeChange: (mode: 'prompt' | 'bash' | 'plan') => void
  pushToBuffer: (
    text: string,
    cursorOffset: number,
    pastedContents: Record<number, PastedContent>,
  ) => void
  trackAndSetInput: (value: string) => void
  setCursorOffset: (offset: number) => void
  clearFooterSelection: () => void
  resolvePromptInputChangePlanImpl?: typeof resolvePromptInputChangePlan
}

export function dispatchPromptInputChange(
  { value, input, cursorOffset, pastedContents }: DispatchPromptInputChangeOptions,
  {
    toggleHelp,
    closeHelp,
    dismissStashHint,
    abortPromptSuggestion,
    abortSpeculation,
    onModeChange,
    pushToBuffer,
    trackAndSetInput,
    setCursorOffset,
    clearFooterSelection,
    resolvePromptInputChangePlanImpl = resolvePromptInputChangePlan,
  }: DispatchPromptInputChangeDeps,
): PromptInputChangePlan {
  const changePlan = resolvePromptInputChangePlanImpl({
    value,
    input,
    cursorOffset,
  })

  if (changePlan.kind === 'toggle_help') {
    toggleHelp()
    return changePlan
  }

  closeHelp()
  dismissStashHint()
  abortPromptSuggestion()
  abortSpeculation()

  if (changePlan.kind === 'change_mode_only') {
    onModeChange(changePlan.nextMode)
    return changePlan
  }

  if (changePlan.kind === 'change_mode_and_input') {
    onModeChange(changePlan.nextMode)
    if (changePlan.shouldPushToBuffer) {
      pushToBuffer(input, cursorOffset, pastedContents)
    }
    trackAndSetInput(changePlan.nextValue)
    setCursorOffset(changePlan.nextCursorOffset)
    return changePlan
  }

  if (changePlan.shouldPushToBuffer) {
    pushToBuffer(input, cursorOffset, pastedContents)
  }

  if (changePlan.shouldClearFooterSelection) {
    clearFooterSelection()
  }

  trackAndSetInput(changePlan.nextValue)
  return changePlan
}
