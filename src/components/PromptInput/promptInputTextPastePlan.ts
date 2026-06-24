import { formatPastedTextRef, getPastedTextRefNumLines } from '../../history.js'
import type { PastedContent } from '../../utils/config.js'
import { PASTE_THRESHOLD } from '../../utils/imagePaste.js'
import type { PromptInputMode } from '../../types/textInputTypes.js'
import { getModeFromInput, getValueFromInput } from './inputModes.js'

export type PromptInputTextPastePlan = {
  nextMode: PromptInputMode | null
  textToInsert: string
  newPastedContent: PastedContent | null
}

type ResolvePromptInputTextPastePlanParams = {
  sanitizedText: string
  inputLength: number
  rows: number
  nextPasteId: number
}

export function resolvePromptInputTextPastePlan({
  sanitizedText,
  inputLength,
  rows,
  nextPasteId,
}: ResolvePromptInputTextPastePlanParams): PromptInputTextPastePlan {
  let text = sanitizedText
  let nextMode: PromptInputMode | null = null

  if (inputLength === 0) {
    const pastedMode = getModeFromInput(text)
    if (pastedMode !== 'prompt') {
      nextMode = pastedMode
      text = getValueFromInput(text)
    }
  }

  const numLines = getPastedTextRefNumLines(text)
  const maxLines = Math.min(rows - 10, 2)

  if (text.length > PASTE_THRESHOLD || numLines > maxLines) {
    return {
      nextMode,
      textToInsert: formatPastedTextRef(nextPasteId, numLines),
      newPastedContent: {
        id: nextPasteId,
        type: 'text',
        content: text,
      },
    }
  }

  return {
    nextMode,
    textToInsert: text,
    newPastedContent: null,
  }
}
