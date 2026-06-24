import type { PastedContent } from '../utils/config.js'
import { popAllEditable } from '../utils/messageQueueManager.js'
import { dispatchPromptInputQueuedCommandRestore } from '../components/PromptInput/promptInputEditingDispatch.js'

export function dispatchReplQueuedCommandCancel(
  {
    input,
    existingPastedContents,
  }: {
    input: string
    existingPastedContents: Record<number, PastedContent>
  },
  {
    setInputValue,
    setModePrompt,
    setPastedContents,
  }: {
    setInputValue: (value: string) => void
    setModePrompt: () => void
    setPastedContents: (value: Record<number, PastedContent>) => void
  },
): boolean {
  return dispatchPromptInputQueuedCommandRestore(
    {
      result: popAllEditable(input, 0),
      existingPastedContents,
    },
    {
      setInputValue,
      setModePrompt,
      setCursorOffset: () => {},
      setPastedContents,
    },
  )
}
