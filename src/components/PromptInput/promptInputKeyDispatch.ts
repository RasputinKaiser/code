import { resolvePromptInputEscapeAction } from './promptInputEscapePlan.js'
import {
  shouldCloseHelpOnEmptyDelete,
  shouldExitPromptInputSpecialModeAtStart,
} from './promptInputEscapePlan.js'

export function dispatchPromptInputFooterTypeToExit(
  {
    footerItemSelected,
    char,
    isCtrl,
    isMeta,
    isEscape,
    isReturn,
    input,
    cursorOffset,
  }: {
    footerItemSelected: boolean
    char: string | undefined
    isCtrl: boolean
    isMeta: boolean
    isEscape: boolean
    isReturn: boolean
    input: string
    cursorOffset: number
  },
  {
    applyInputChange,
    setCursorOffset,
  }: {
    applyInputChange: (value: string) => void
    setCursorOffset: (value: number) => void
  },
): boolean {
  if (
    !footerItemSelected ||
    !char ||
    isCtrl ||
    isMeta ||
    isEscape ||
    isReturn
  ) {
    return false
  }

  applyInputChange(input.slice(0, cursorOffset) + char + input.slice(cursorOffset))
  setCursorOffset(cursorOffset + char.length)
  return true
}

export function dispatchPromptInputSpecialModeExit(
  {
    shouldExitSpecialMode,
    shouldCloseHelpOnEmptyDelete,
  }: {
    shouldExitSpecialMode: boolean
    shouldCloseHelpOnEmptyDelete: boolean
  },
  {
    setModePrompt,
    closeHelp,
  }: {
    setModePrompt: () => void
    closeHelp: () => void
  },
): void {
  if (shouldExitSpecialMode) {
    setModePrompt()
    closeHelp()
  }

  if (shouldCloseHelpOnEmptyDelete) {
    closeHelp()
  }
}

export function dispatchPromptInputEscape(
  {
    speculationActive,
    sideQuestionVisible,
    helpOpen,
    footerItemSelected,
    hasEditableQueuedCommand,
    hasMessages,
    input,
    isLoading,
  }: {
    speculationActive: boolean
    sideQuestionVisible: boolean
    helpOpen: boolean
    footerItemSelected: boolean
    hasEditableQueuedCommand: boolean
    hasMessages: boolean
    input: string
    isLoading: boolean
  },
  {
    abortSpeculation,
    dismissSideQuestion,
    closeHelp,
    popQueuedCommands,
    doublePressEmpty,
  }: {
    abortSpeculation: () => void
    dismissSideQuestion: () => void
    closeHelp: () => void
    popQueuedCommands: () => void
    doublePressEmpty: () => void
  },
): boolean {
  const escapeAction = resolvePromptInputEscapeAction({
    speculationActive,
    sideQuestionVisible,
    helpOpen,
    footerItemSelected,
    hasEditableQueuedCommand,
    hasMessages,
    input,
    isLoading,
  })

  if (escapeAction === 'abort_speculation') {
    abortSpeculation()
    return true
  }

  if (escapeAction === 'dismiss_side_question') {
    dismissSideQuestion()
    return true
  }

  if (escapeAction === 'close_help') {
    closeHelp()
    return true
  }

  if (escapeAction === 'footer_handles_escape') {
    return true
  }

  if (escapeAction === 'pop_queued_commands') {
    popQueuedCommands()
    return true
  }

  if (escapeAction === 'double_press_empty') {
    doublePressEmpty()
    return true
  }

  return false
}

export function dispatchPromptInputUseInput(
  {
    footerItemSelected,
    char,
    isCtrl,
    isMeta,
    isEscape,
    isReturn,
    isBackspace,
    isDelete,
    input,
    cursorOffset,
    helpOpen,
    speculationActive,
    sideQuestionVisible,
    hasEditableQueuedCommand,
    hasMessages,
    isLoading,
  }: {
    footerItemSelected: boolean
    char: string | undefined
    isCtrl: boolean
    isMeta: boolean
    isEscape: boolean
    isReturn: boolean
    isBackspace: boolean
    isDelete: boolean
    input: string
    cursorOffset: number
    helpOpen: boolean
    speculationActive: boolean
    sideQuestionVisible: boolean
    hasEditableQueuedCommand: boolean
    hasMessages: boolean
    isLoading: boolean
  },
  {
    applyInputChange,
    setCursorOffset,
    setModePrompt,
    closeHelp,
    abortSpeculation,
    dismissSideQuestion,
    popQueuedCommands,
    doublePressEmpty,
  }: {
    applyInputChange: (value: string) => void
    setCursorOffset: (value: number) => void
    setModePrompt: () => void
    closeHelp: () => void
    abortSpeculation: () => void
    dismissSideQuestion: () => void
    popQueuedCommands: () => void
    doublePressEmpty: () => void
  },
): boolean {
  if (
    dispatchPromptInputFooterTypeToExit(
      {
        footerItemSelected,
        char,
        isCtrl,
        isMeta,
        isEscape,
        isReturn,
        input,
        cursorOffset,
      },
      {
        applyInputChange,
        setCursorOffset,
      },
    )
  ) {
    return true
  }

  dispatchPromptInputSpecialModeExit(
    {
      shouldExitSpecialMode: shouldExitPromptInputSpecialModeAtStart({
        cursorOffset,
        isEscape,
        isBackspace,
        isDelete,
        isCtrlU: !!(isCtrl && char === 'u'),
      }),
      shouldCloseHelpOnEmptyDelete: shouldCloseHelpOnEmptyDelete({
        helpOpen,
        input,
        isBackspace,
        isDelete,
      }),
    },
    {
      setModePrompt,
      closeHelp,
    },
  )

  if (
    isEscape &&
    dispatchPromptInputEscape(
      {
        speculationActive,
        sideQuestionVisible,
        helpOpen,
        footerItemSelected,
        hasEditableQueuedCommand,
        hasMessages,
        input,
        isLoading,
      },
      {
        abortSpeculation,
        dismissSideQuestion,
        closeHelp,
        popQueuedCommands,
        doublePressEmpty,
      },
    )
  ) {
    return true
  }

  if (isReturn && helpOpen) {
    closeHelp()
    return true
  }

  return false
}
