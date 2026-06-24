import type { PromptInputMode } from '../../types/textInputTypes.js'
import { getModeFromInput, getValueFromInput } from './inputModes.js'

export type PromptInputChangePlan =
  | { kind: 'toggle_help' }
  | { kind: 'change_mode_only'; nextMode: PromptInputMode }
  | {
      kind: 'change_mode_and_input'
      nextMode: PromptInputMode
      nextValue: string
      nextCursorOffset: number
      shouldPushToBuffer: boolean
    }
  | {
      kind: 'update_input'
      nextValue: string
      shouldPushToBuffer: boolean
      shouldClearFooterSelection: boolean
    }

type ResolvePromptInputChangePlanParams = {
  value: string
  input: string
  cursorOffset: number
}

export function resolvePromptInputChangePlan({
  value,
  input,
  cursorOffset,
}: ResolvePromptInputChangePlanParams): PromptInputChangePlan {
  if (value === '?') {
    return { kind: 'toggle_help' }
  }

  const isSingleCharInsertion = value.length === input.length + 1
  const insertedAtStart = cursorOffset === 0
  const nextMode = getModeFromInput(value)

  if (insertedAtStart && nextMode !== 'prompt') {
    if (isSingleCharInsertion && input.length === 0) {
      return {
        kind: 'change_mode_and_input',
        nextMode,
        nextValue: '',
        nextCursorOffset: 0,
        shouldPushToBuffer: true,
      }
    }

    if (input.length === 0) {
      const nextValue = getValueFromInput(value).replaceAll('\t', '    ')
      return {
        kind: 'change_mode_and_input',
        nextMode,
        nextValue,
        nextCursorOffset: nextValue.length,
        shouldPushToBuffer: true,
      }
    }
  }

  const nextValue = value.replaceAll('\t', '    ')
  return {
    kind: 'update_input',
    nextValue,
    shouldPushToBuffer: input !== nextValue,
    shouldClearFooterSelection: true,
  }
}
