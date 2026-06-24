import type { FooterItem } from 'src/state/AppStateStore.js'

type VisibleTask = {
  id: string
  status: string
}

export function dispatchPromptInputFooterUp(
  {
    tasksSelected,
    isAnthropicUser,
    coordinatorTaskCount,
    coordinatorTaskIndex,
    minCoordinatorIndex,
  }: {
    tasksSelected: boolean
    isAnthropicUser: boolean
    coordinatorTaskCount: number
    coordinatorTaskIndex: number
    minCoordinatorIndex: number
  },
  {
    decrementCoordinatorTaskIndex,
    navigateFooterUp,
  }: {
    decrementCoordinatorTaskIndex: () => void
    navigateFooterUp: () => void
  },
): void {
  if (
    tasksSelected &&
    isAnthropicUser &&
    coordinatorTaskCount > 0 &&
    coordinatorTaskIndex > minCoordinatorIndex
  ) {
    decrementCoordinatorTaskIndex()
    return
  }
  navigateFooterUp()
}

export function dispatchPromptInputFooterDown(
  {
    tasksSelected,
    isAnthropicUser,
    coordinatorTaskCount,
    coordinatorTaskIndex,
    isTeammateMode,
  }: {
    tasksSelected: boolean
    isAnthropicUser: boolean
    coordinatorTaskCount: number
    coordinatorTaskIndex: number
    isTeammateMode: boolean
  },
  {
    incrementCoordinatorTaskIndex,
    openBashesDialog,
    clearSelection,
    navigateFooterDown,
  }: {
    incrementCoordinatorTaskIndex: () => void
    openBashesDialog: () => void
    clearSelection: () => void
    navigateFooterDown: () => void
  },
): void {
  if (tasksSelected && isAnthropicUser && coordinatorTaskCount > 0) {
    if (coordinatorTaskIndex < coordinatorTaskCount - 1) {
      incrementCoordinatorTaskIndex()
    }
    return
  }
  if (tasksSelected && !isTeammateMode) {
    openBashesDialog()
    clearSelection()
    return
  }
  navigateFooterDown()
}

export function dispatchPromptInputFooterNext(
  {
    tasksSelected,
    isTeammateMode,
    teammateCount,
  }: {
    tasksSelected: boolean
    isTeammateMode: boolean
    teammateCount: number
  },
  {
    cycleTeammateForward,
    navigateFooterDown,
  }: {
    cycleTeammateForward: (totalAgents: number) => void
    navigateFooterDown: () => void
  },
): void {
  if (tasksSelected && isTeammateMode) {
    cycleTeammateForward(1 + teammateCount)
    return
  }
  navigateFooterDown()
}

export function dispatchPromptInputFooterPrevious(
  {
    tasksSelected,
    isTeammateMode,
    teammateCount,
  }: {
    tasksSelected: boolean
    isTeammateMode: boolean
    teammateCount: number
  },
  {
    cycleTeammateBackward,
    navigateFooterUp,
  }: {
    cycleTeammateBackward: (totalAgents: number) => void
    navigateFooterUp: () => void
  },
): void {
  if (tasksSelected && isTeammateMode) {
    cycleTeammateBackward(1 + teammateCount)
    return
  }
  navigateFooterUp()
}

export function dispatchPromptInputFooterOpenSelected(
  {
    viewSelectionMode,
    footerItemSelected,
    buddyEnabled,
    isTeammateMode,
    teammateFooterIndex,
    coordinatorTaskIndex,
    coordinatorTaskCount,
  }: {
    viewSelectionMode: string | null | undefined
    footerItemSelected: FooterItem | null
    buddyEnabled: boolean
    isTeammateMode: boolean
    teammateFooterIndex: number
    coordinatorTaskIndex: number
    coordinatorTaskCount: number
  },
  {
    clearSelection,
    submitBuddy,
    exitTeammateView,
    enterTeammateView,
    getTeammateIdAtIndex,
    getVisibleTaskIdAtIndex,
    openBashesDialog,
    toggleTmuxPanel,
    openTeamsDialog,
    openBridgeDialog,
  }: {
    clearSelection: () => void
    submitBuddy: () => void
    exitTeammateView: () => void
    enterTeammateView: (taskId: string) => void
    getTeammateIdAtIndex: (index: number) => string | undefined
    getVisibleTaskIdAtIndex: (index: number) => string | undefined
    openBashesDialog: () => void
    toggleTmuxPanel: () => void
    openTeamsDialog: () => void
    openBridgeDialog: () => void
  },
): void {
  if (viewSelectionMode === 'selecting-agent') {
    return
  }

  switch (footerItemSelected) {
    case 'companion':
      if (buddyEnabled) {
        clearSelection()
        submitBuddy()
      }
      break
    case 'tasks':
      if (isTeammateMode) {
        if (teammateFooterIndex === 0) {
          exitTeammateView()
        } else {
          const teammateId = getTeammateIdAtIndex(teammateFooterIndex - 1)
          if (teammateId) {
            enterTeammateView(teammateId)
          }
        }
      } else if (coordinatorTaskIndex === 0 && coordinatorTaskCount > 0) {
        exitTeammateView()
      } else {
        const selectedTaskId = getVisibleTaskIdAtIndex(coordinatorTaskIndex - 1)
        if (selectedTaskId) {
          enterTeammateView(selectedTaskId)
        } else {
          openBashesDialog()
          clearSelection()
        }
      }
      break
    case 'tmux':
      toggleTmuxPanel()
      break
    case 'bagel':
      break
    case 'teams':
      openTeamsDialog()
      clearSelection()
      break
    case 'bridge':
      openBridgeDialog()
      clearSelection()
      break
  }
}

export function dispatchPromptInputFooterClose(
  {
    tasksSelected,
    coordinatorTaskIndex,
    viewSelectionMode,
    viewingAgentTaskId,
    input,
    cursorOffset,
  }: {
    tasksSelected: boolean
    coordinatorTaskIndex: number
    viewSelectionMode: string | null | undefined
    viewingAgentTaskId: string | null | undefined
    input: string
    cursorOffset: number
  },
  {
    getVisibleTaskAtIndex,
    typeIntoInput,
    dismissTask,
    decrementCoordinatorTaskIndex,
  }: {
    getVisibleTaskAtIndex: (index: number) => VisibleTask | undefined
    typeIntoInput: (nextInput: string, nextCursorOffset: number) => void
    dismissTask: (taskId: string) => void
    decrementCoordinatorTaskIndex: () => void
  },
): boolean {
  if (!(tasksSelected && coordinatorTaskIndex >= 1)) {
    return false
  }

  const task = getVisibleTaskAtIndex(coordinatorTaskIndex - 1)
  if (!task) {
    return false
  }

  if (viewSelectionMode === 'viewing-agent' && task.id === viewingAgentTaskId) {
    typeIntoInput(
      input.slice(0, cursorOffset) + 'x' + input.slice(cursorOffset),
      cursorOffset + 1,
    )
    return true
  }

  dismissTask(task.id)
  if (task.status !== 'running') {
    decrementCoordinatorTaskIndex()
  }
  return true
}
