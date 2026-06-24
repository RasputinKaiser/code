import type { FooterItem } from 'src/state/AppStateStore.js'

import {
  dispatchPromptInputFooterClose,
  dispatchPromptInputFooterDown,
  dispatchPromptInputFooterNext,
  dispatchPromptInputFooterOpenSelected,
  dispatchPromptInputFooterPrevious,
  dispatchPromptInputFooterUp,
} from './promptInputFooterKeyDispatch.js'

type VisibleTask = {
  id: string
  status: string
}

export function createPromptInputFooterBindingHandlers(
  {
    tasksSelected,
    isAnthropicUser,
    coordinatorTaskCount,
    coordinatorTaskIndex,
    minCoordinatorIndex,
    isTeammateMode,
    teammateCount,
    viewSelectionMode,
    footerItemSelected,
    buddyEnabled,
    teammateFooterIndex,
    viewingAgentTaskId,
    input,
    cursorOffset,
  }: {
    tasksSelected: boolean
    isAnthropicUser: boolean
    coordinatorTaskCount: number
    coordinatorTaskIndex: number
    minCoordinatorIndex: number
    isTeammateMode: boolean
    teammateCount: number
    viewSelectionMode: string | null | undefined
    footerItemSelected: FooterItem | null
    buddyEnabled: boolean
    teammateFooterIndex: number
    viewingAgentTaskId: string | null | undefined
    input: string
    cursorOffset: number
  },
  {
    decrementCoordinatorTaskIndex,
    incrementCoordinatorTaskIndex,
    navigateFooterUp,
    navigateFooterDown,
    cycleTeammateForward,
    cycleTeammateBackward,
    clearSelection,
    submitBuddy,
    exitTeammateView,
    enterTeammateView,
    getTeammateIdAtIndex,
    getVisibleTaskIdAtIndex,
    getVisibleTaskAtIndex,
    openBashesDialog,
    toggleTmuxPanel,
    openTeamsDialog,
    openBridgeDialog,
    typeIntoInput,
    dismissTask,
  }: {
    decrementCoordinatorTaskIndex: () => void
    incrementCoordinatorTaskIndex: () => void
    navigateFooterUp: () => void
    navigateFooterDown: () => void
    cycleTeammateForward: (totalAgents: number) => void
    cycleTeammateBackward: (totalAgents: number) => void
    clearSelection: () => void
    submitBuddy: () => void
    exitTeammateView: () => void
    enterTeammateView: (taskId: string) => void
    getTeammateIdAtIndex: (index: number) => string | undefined
    getVisibleTaskIdAtIndex: (index: number) => string | undefined
    getVisibleTaskAtIndex: (index: number) => VisibleTask | undefined
    openBashesDialog: () => void
    toggleTmuxPanel: () => void
    openTeamsDialog: () => void
    openBridgeDialog: () => void
    typeIntoInput: (nextInput: string, nextCursorOffset: number) => void
    dismissTask: (taskId: string) => void
  },
) {
  return {
    'footer:up': () => {
      dispatchPromptInputFooterUp(
        {
          tasksSelected,
          isAnthropicUser,
          coordinatorTaskCount,
          coordinatorTaskIndex,
          minCoordinatorIndex,
        },
        {
          decrementCoordinatorTaskIndex,
          navigateFooterUp,
        },
      )
    },
    'footer:down': () => {
      dispatchPromptInputFooterDown(
        {
          tasksSelected,
          isAnthropicUser,
          coordinatorTaskCount,
          coordinatorTaskIndex,
          isTeammateMode,
        },
        {
          incrementCoordinatorTaskIndex,
          openBashesDialog,
          clearSelection,
          navigateFooterDown,
        },
      )
    },
    'footer:next': () => {
      dispatchPromptInputFooterNext(
        {
          tasksSelected,
          isTeammateMode,
          teammateCount,
        },
        {
          cycleTeammateForward,
          navigateFooterDown,
        },
      )
    },
    'footer:previous': () => {
      dispatchPromptInputFooterPrevious(
        {
          tasksSelected,
          isTeammateMode,
          teammateCount,
        },
        {
          cycleTeammateBackward,
          navigateFooterUp,
        },
      )
    },
    'footer:openSelected': () => {
      dispatchPromptInputFooterOpenSelected(
        {
          viewSelectionMode,
          footerItemSelected,
          buddyEnabled,
          isTeammateMode,
          teammateFooterIndex,
          coordinatorTaskIndex,
          coordinatorTaskCount,
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
        },
      )
    },
    'footer:clearSelection': () => {
      clearSelection()
    },
    'footer:close': () => {
      return dispatchPromptInputFooterClose(
        {
          tasksSelected,
          coordinatorTaskIndex,
          viewSelectionMode,
          viewingAgentTaskId,
          input,
          cursorOffset,
        },
        {
          getVisibleTaskAtIndex,
          typeIntoInput,
          dismissTask,
          decrementCoordinatorTaskIndex,
        },
      )
    },
  } as const
}
