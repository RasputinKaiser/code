export type ReplIdleReturnDialogPreflightResult = {
  shouldOpenDialog: boolean
  idleMinutes: number
}

export function dispatchReplIdleReturnDialog(
  {
    input,
    idleReturnPreflight,
  }: {
    input: string
    idleReturnPreflight: ReplIdleReturnDialogPreflightResult
  },
  {
    setIdleReturnPending,
    setInputValue,
    setCursorOffset,
    clearBuffer,
  }: {
    setIdleReturnPending: (value: { input: string; idleMinutes: number }) => void
    setInputValue: (value: string) => void
    setCursorOffset: (value: number) => void
    clearBuffer: () => void
  },
): boolean {
  if (!idleReturnPreflight.shouldOpenDialog) {
    return false
  }

  setIdleReturnPending({
    input,
    idleMinutes: idleReturnPreflight.idleMinutes,
  })
  setInputValue('')
  setCursorOffset(0)
  clearBuffer()
  return true
}
