export type PromptInputEscapeAction =
  | 'abort_speculation'
  | 'dismiss_side_question'
  | 'close_help'
  | 'footer_handles_escape'
  | 'pop_queued_commands'
  | 'double_press_empty'
  | 'noop'

export function resolvePromptInputEscapeAction({
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
}): PromptInputEscapeAction {
  if (speculationActive) {
    return 'abort_speculation'
  }

  if (sideQuestionVisible) {
    return 'dismiss_side_question'
  }

  if (helpOpen) {
    return 'close_help'
  }

  if (footerItemSelected) {
    return 'footer_handles_escape'
  }

  if (hasEditableQueuedCommand) {
    return 'pop_queued_commands'
  }

  if (hasMessages && !input && !isLoading) {
    return 'double_press_empty'
  }

  return 'noop'
}

export function shouldExitPromptInputSpecialModeAtStart({
  cursorOffset,
  isEscape,
  isBackspace,
  isDelete,
  isCtrlU,
}: {
  cursorOffset: number
  isEscape: boolean
  isBackspace: boolean
  isDelete: boolean
  isCtrlU: boolean
}): boolean {
  return (
    cursorOffset === 0 && (isEscape || isBackspace || isDelete || isCtrlU)
  )
}

export function shouldCloseHelpOnEmptyDelete({
  helpOpen,
  input,
  isBackspace,
  isDelete,
}: {
  helpOpen: boolean
  input: string
  isBackspace: boolean
  isDelete: boolean
}): boolean {
  return helpOpen && input === '' && (isBackspace || isDelete)
}
