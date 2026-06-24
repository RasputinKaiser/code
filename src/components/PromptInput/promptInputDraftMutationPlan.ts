import type { PastedContent } from '../../utils/config.js'

export type PromptInputStashState = {
  text: string
  cursorOffset: number
  pastedContents: Record<number, PastedContent>
}

export function insertTextAtCursorState({
  input,
  cursorOffset,
  text,
}: {
  input: string
  cursorOffset: number
  text: string
}): {
  nextInput: string
  nextCursorOffset: number
} {
  return {
    nextInput: input.slice(0, cursorOffset) + text + input.slice(cursorOffset),
    nextCursorOffset: cursorOffset + text.length,
  }
}

export function resolvePromptInputExternalEditorApplyPlan({
  input,
  resultContent,
}: {
  input: string
  resultContent: string | null
}): {
  shouldApply: boolean
  nextInput: string
  nextCursorOffset: number
} {
  if (resultContent === null || resultContent === input) {
    return {
      shouldApply: false,
      nextInput: input,
      nextCursorOffset: input.length,
    }
  }

  return {
    shouldApply: true,
    nextInput: resultContent,
    nextCursorOffset: resultContent.length,
  }
}

export type PromptInputStashPlan =
  | {
      kind: 'restore'
      nextInput: string
      nextCursorOffset: number
      nextPastedContents: Record<number, PastedContent>
      nextStash: undefined
    }
  | {
      kind: 'stash'
      nextInput: ''
      nextCursorOffset: 0
      nextPastedContents: Record<number, PastedContent>
      nextStash: PromptInputStashState
    }
  | {
      kind: 'noop'
    }

export function resolvePromptInputStashPlan({
  input,
  cursorOffset,
  stashedPrompt,
  pastedContents,
}: {
  input: string
  cursorOffset: number
  stashedPrompt: PromptInputStashState | undefined
  pastedContents: Record<number, PastedContent>
}): PromptInputStashPlan {
  if (input.trim() === '' && stashedPrompt !== undefined) {
    return {
      kind: 'restore',
      nextInput: stashedPrompt.text,
      nextCursorOffset: stashedPrompt.cursorOffset,
      nextPastedContents: stashedPrompt.pastedContents,
      nextStash: undefined,
    }
  }

  if (input.trim() !== '') {
    return {
      kind: 'stash',
      nextInput: '',
      nextCursorOffset: 0,
      nextPastedContents: {},
      nextStash: {
        text: input,
        cursorOffset,
        pastedContents,
      },
    }
  }

  return {
    kind: 'noop',
  }
}
