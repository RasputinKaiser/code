import type { BufferEntry } from '../../hooks/useInputBuffer.js'
import type { PastedContent } from '../../utils/config.js'

export type PromptInputUndoPlan =
  | { kind: 'noop' }
  | {
      kind: 'restore'
      nextInput: string
      nextCursorOffset: number
      nextPastedContents: Record<number, PastedContent>
    }

export function resolvePromptInputUndoPlan(
  previousState: BufferEntry | undefined,
): PromptInputUndoPlan {
  if (!previousState) {
    return { kind: 'noop' }
  }

  return {
    kind: 'restore',
    nextInput: previousState.text,
    nextCursorOffset: previousState.cursorOffset,
    nextPastedContents: previousState.pastedContents,
  }
}
