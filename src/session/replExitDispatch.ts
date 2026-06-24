export async function dispatchReplExit(
  state: {
    bgSessionsEnabled: boolean
    bgSessionActive: boolean
    hasCurrentWorktree: boolean
  },
  deps: {
    setIsExiting: (value: boolean) => void
    detachTmuxClient: () => void
    createWorktreeExitFlow: (params: {
      onDone: () => void
      onCancel: () => void
    }) => unknown
    clearExitFlow: () => void
    setExitFlow: (value: unknown) => void
    loadExitModule: () => Promise<{
      call: (onDone: () => void) => Promise<unknown>
    }>
  },
): Promise<void> {
  deps.setIsExiting(true)

  if (state.bgSessionsEnabled && state.bgSessionActive) {
    deps.detachTmuxClient()
    deps.setIsExiting(false)
    return
  }

  if (state.hasCurrentWorktree) {
    deps.setExitFlow(
      deps.createWorktreeExitFlow({
        onDone: () => {},
        onCancel: () => {
          deps.clearExitFlow()
          deps.setIsExiting(false)
        },
      }),
    )
    return
  }

  const exitMod = await deps.loadExitModule()
  const exitFlowResult = await exitMod.call(() => {})
  deps.setExitFlow(exitFlowResult)

  if (exitFlowResult === null) {
    deps.setIsExiting(false)
  }
}
