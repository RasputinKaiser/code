import { errorMessage } from '../../utils/errors.js'
import type { PastedContent } from '../../utils/config.js'
import type { EditorResult } from '../../utils/promptEditor.js'
import {
  insertTextAtCursorState,
  resolvePromptInputExternalEditorApplyPlan,
  resolvePromptInputStashPlan,
  type PromptInputStashState,
} from './promptInputDraftMutationPlan.js'
import { resolvePromptInputQueuedCommandRestorePlan } from './promptInputQueuedCommandRestorePlan.js'

import type { PopAllEditableResult } from 'src/utils/messageQueueManager.js'

export function dispatchPromptInputQueuedCommandRestore(
  {
    result,
    existingPastedContents,
  }: {
    result: PopAllEditableResult | null
    existingPastedContents: Record<number, PastedContent>
  },
  {
    setInputValue,
    setModePrompt,
    setCursorOffset,
    setPastedContents,
  }: {
    setInputValue: (value: string) => void
    setModePrompt: () => void
    setCursorOffset: (value: number) => void
    setPastedContents: (value: Record<number, PastedContent>) => void
  },
): boolean {
  if (!result) {
    return false
  }

  const restorePlan = resolvePromptInputQueuedCommandRestorePlan({
    result,
    existingPastedContents,
  })
  setInputValue(restorePlan.nextInput)
  setModePrompt()
  setCursorOffset(restorePlan.nextCursorOffset)
  setPastedContents(restorePlan.nextPastedContents)
  return true
}

export function dispatchPromptInputNewline(
  {
    input,
    cursorOffset,
    pastedContents,
  }: {
    input: string
    cursorOffset: number
    pastedContents: Record<number, PastedContent>
  },
  {
    pushToBuffer,
    setInputValue,
    setCursorOffset,
  }: {
    pushToBuffer: (
      input: string,
      cursorOffset: number,
      pastedContents: Record<number, PastedContent>,
    ) => void
    setInputValue: (value: string) => void
    setCursorOffset: (value: number) => void
  },
): void {
  pushToBuffer(input, cursorOffset, pastedContents)
  const insertPlan = insertTextAtCursorState({
    input,
    cursorOffset,
    text: '\n',
  })
  setInputValue(insertPlan.nextInput)
  setCursorOffset(insertPlan.nextCursorOffset)
}

export async function dispatchPromptInputExternalEditor(
  {
    input,
    cursorOffset,
    pastedContents,
  }: {
    input: string
    cursorOffset: number
    pastedContents: Record<number, PastedContent>
  },
  {
    logEditorUsed,
    setExternalEditorActive,
    editPromptInEditorImpl,
    addNotification,
    logErrorImpl,
    pushToBuffer,
    setInputValue,
    setCursorOffset,
  }: {
    logEditorUsed: () => void
    setExternalEditorActive: (value: boolean) => void
    editPromptInEditorImpl: (
      input: string,
      pastedContents: Record<number, PastedContent>,
    ) => EditorResult | Promise<EditorResult>
    addNotification: (options: {
      key: string
      text: string
      color: 'warning'
      priority: 'high'
    }) => void
    logErrorImpl: (err: Error) => void
    pushToBuffer: (
      input: string,
      cursorOffset: number,
      pastedContents: Record<number, PastedContent>,
    ) => void
    setInputValue: (value: string) => void
    setCursorOffset: (value: number) => void
  },
): Promise<void> {
  logEditorUsed()
  setExternalEditorActive(true)
  try {
    const result = await editPromptInEditorImpl(input, pastedContents)
    if (result.error) {
      addNotification({
        key: 'external-editor-error',
        text: result.error,
        color: 'warning',
        priority: 'high',
      })
    }
    const editorApplyPlan = resolvePromptInputExternalEditorApplyPlan({
      input,
      resultContent: result.content,
    })
    if (editorApplyPlan.shouldApply) {
      pushToBuffer(input, cursorOffset, pastedContents)
      setInputValue(editorApplyPlan.nextInput)
      setCursorOffset(editorApplyPlan.nextCursorOffset)
    }
  } catch (err) {
    if (err instanceof Error) {
      logErrorImpl(err)
    }
    addNotification({
      key: 'external-editor-error',
      text: `External editor failed: ${errorMessage(err)}`,
      color: 'warning',
      priority: 'high',
    })
  } finally {
    setExternalEditorActive(false)
  }
}

export function dispatchPromptInputStash(
  {
    input,
    cursorOffset,
    stashedPrompt,
    pastedContents,
  }: {
    input: string
    cursorOffset: number
    stashedPrompt: PromptInputStashState | undefined
    pastedContents: Record<number, PastedContent>
  },
  {
    setStashedPrompt,
    setInputValue,
    setCursorOffset,
    setPastedContents,
    markStashUsed,
  }: {
    setStashedPrompt: (value: PromptInputStashState | undefined) => void
    setInputValue: (value: string) => void
    setCursorOffset: (value: number) => void
    setPastedContents: (value: Record<number, PastedContent>) => void
    markStashUsed: () => void
  },
): void {
  const stashPlan = resolvePromptInputStashPlan({
    input,
    cursorOffset,
    stashedPrompt,
    pastedContents,
  })

  if (stashPlan.kind === 'restore') {
    setInputValue(stashPlan.nextInput)
    setCursorOffset(stashPlan.nextCursorOffset)
    setPastedContents(stashPlan.nextPastedContents)
    setStashedPrompt(stashPlan.nextStash)
  } else if (stashPlan.kind === 'stash') {
    setStashedPrompt(stashPlan.nextStash)
    setInputValue(stashPlan.nextInput)
    setCursorOffset(stashPlan.nextCursorOffset)
    setPastedContents(stashPlan.nextPastedContents)
    markStashUsed()
  }
}
