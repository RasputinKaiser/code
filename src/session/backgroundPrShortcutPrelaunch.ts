import type { PastedContent } from '../utils/config.js'
import type { PromptInputHelpers } from '../utils/handlePromptSubmit.js'
import type { PromptInputMode } from '../types/textInputTypes.js'
import type { IDESelection } from '../hooks/useIdeSelection.js'
import type { DispatchBackgroundPrShortcutDeps } from './backgroundPrShortcutDispatch.js'
import {
  dispatchBackgroundPrShortcut,
  type BackgroundPrShortcutDispatchOptions,
} from './backgroundPrShortcutDispatch.js'

export type BackgroundPrShortcutPrelaunchOptions = BackgroundPrShortcutDispatchOptions & {
  shouldAddToHistory: boolean
  input: string
  pastedContents: Record<number, PastedContent>
  getInputValue: () => string
  helpers: Pick<PromptInputHelpers, 'setCursorOffset' | 'clearBuffer'>
}

export type BackgroundPrShortcutPrelaunchDeps = DispatchBackgroundPrShortcutDeps & {
  addToHistory: (entry: {
    display: string
    pastedContents: Record<number, PastedContent>
  }) => void
  setInputValue: (value: string) => void
  setPastedContents: (value: Record<number, PastedContent>) => void
  setInputMode: (mode: PromptInputMode) => void
  setIDESelection: (selection: IDESelection | undefined) => void
  incrementSubmitCount: () => void
  dispatchBackgroundPrShortcutImpl?: typeof dispatchBackgroundPrShortcut
}

export async function dispatchBackgroundPrShortcutPrelaunch(
  {
    shouldAddToHistory,
    input,
    pastedContents,
    getInputValue,
    helpers,
    ...dispatchOptions
  }: BackgroundPrShortcutPrelaunchOptions,
  {
    addToHistory,
    setInputValue,
    setPastedContents,
    setInputMode,
    setIDESelection,
    incrementSubmitCount,
    dispatchBackgroundPrShortcutImpl = dispatchBackgroundPrShortcut,
    ...dispatchDeps
  }: BackgroundPrShortcutPrelaunchDeps,
): Promise<void> {
  if (shouldAddToHistory) {
    addToHistory({
      display: input,
      pastedContents,
    })
  }

  if (input.trim() === getInputValue().trim()) {
    setInputValue('')
    helpers.setCursorOffset(0)
  }
  setPastedContents({})
  setInputMode('prompt')
  setIDESelection(undefined)
  incrementSubmitCount()
  helpers.clearBuffer()

  await dispatchBackgroundPrShortcutImpl(
    {
      input,
      ...dispatchOptions,
    },
    dispatchDeps,
  )
}
