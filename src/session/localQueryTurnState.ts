type CommandAllowRulesState = {
  toolPermissionContext: {
    alwaysAllowRules: {
      command?: string[]
    }
  }
}

type CommandAllowRulesStore<TState extends CommandAllowRulesState> = {
  setState: (updater: (prev: TState) => TState) => void
}

type CompactBoundaryLike = {
  type: string
  subtype?: string
}

export function syncAllowedToolsForTurn<TState extends CommandAllowRulesState>(
  store: CommandAllowRulesStore<TState>,
  additionalAllowedTools: string[],
): void {
  store.setState(prev => {
    const current = prev.toolPermissionContext.alwaysAllowRules.command
    if (
      current === additionalAllowedTools ||
      (current?.length === additionalAllowedTools.length &&
        current.every((value, index) => value === additionalAllowedTools[index]))
    ) {
      return prev
    }

    return {
      ...prev,
      toolPermissionContext: {
        ...prev.toolPermissionContext,
        alwaysAllowRules: {
          ...prev.toolPermissionContext.alwaysAllowRules,
          command: additionalAllowedTools,
        },
      },
    }
  })
}

function isCompactBoundaryMessage(message: CompactBoundaryLike): boolean {
  return message.type === 'system' && message.subtype === 'compact_boundary'
}

export type HandleSkippedLocalQueryTurnOptions = {
  newMessages: CompactBoundaryLike[]
  resetLoadingState: () => void
  setAbortController: (abortController: AbortController | null) => void
  onCompactBoundary?: () => void
}

export function handleSkippedLocalQueryTurn(
  options: HandleSkippedLocalQueryTurnOptions,
): void {
  const {
    newMessages,
    resetLoadingState,
    setAbortController,
    onCompactBoundary,
  } = options

  if (newMessages.some(isCompactBoundaryMessage)) {
    onCompactBoundary?.()
  }

  resetLoadingState()
  setAbortController(null)
}
