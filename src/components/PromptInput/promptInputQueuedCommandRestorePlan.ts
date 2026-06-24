import type { PopAllEditableResult } from 'src/utils/messageQueueManager.js'
import type { PastedContent } from '../../utils/config.js'

export function resolvePromptInputQueuedCommandRestorePlan({
  result,
  existingPastedContents,
}: {
  result: PopAllEditableResult
  existingPastedContents: Record<number, PastedContent>
}): {
  nextInput: string
  nextMode: 'prompt'
  nextCursorOffset: number
  nextPastedContents: Record<number, PastedContent>
} {
  const nextPastedContents =
    result.images.length === 0
      ? existingPastedContents
      : result.images.reduce<Record<number, PastedContent>>(
          (acc, image) => {
            acc[image.id] = image
            return acc
          },
          { ...existingPastedContents },
        )

  return {
    nextInput: result.text,
    nextMode: 'prompt',
    nextCursorOffset: result.cursorOffset,
    nextPastedContents,
  }
}
