import { describe, expect, it, mock } from 'bun:test'

import { createPromptInputFooterBindingHandlers } from './promptInputFooterBindingDispatch.js'

describe('createPromptInputFooterBindingHandlers', () => {
  it('opens the bashes dialog and clears selection when task open falls back', () => {
    const clearSelection = mock(() => {})
    const openBashesDialog = mock(() => {})

    const handlers = createPromptInputFooterBindingHandlers(
      {
        tasksSelected: false,
        isAnthropicUser: false,
        coordinatorTaskCount: 2,
        coordinatorTaskIndex: 1,
        minCoordinatorIndex: 0,
        isTeammateMode: false,
        teammateCount: 0,
        viewSelectionMode: null,
        footerItemSelected: 'tasks',
        buddyEnabled: false,
        teammateFooterIndex: 0,
        viewingAgentTaskId: null,
        input: '',
        cursorOffset: 0,
      },
      {
        decrementCoordinatorTaskIndex: () => {},
        incrementCoordinatorTaskIndex: () => {},
        navigateFooterUp: () => {},
        navigateFooterDown: () => {},
        cycleTeammateForward: () => {},
        cycleTeammateBackward: () => {},
        clearSelection,
        submitBuddy: () => {},
        exitTeammateView: () => {},
        enterTeammateView: () => {},
        getTeammateIdAtIndex: () => undefined,
        getVisibleTaskIdAtIndex: () => undefined,
        getVisibleTaskAtIndex: () => undefined,
        openBashesDialog,
        toggleTmuxPanel: () => {},
        openTeamsDialog: () => {},
        openBridgeDialog: () => {},
        typeIntoInput: () => {},
        dismissTask: () => {},
      },
    )

    handlers['footer:openSelected']()

    expect(openBashesDialog).toHaveBeenCalledTimes(1)
    expect(clearSelection).toHaveBeenCalledTimes(1)
  })

  it('keeps the close-in-viewing-agent contract that types x into the input', () => {
    const typeIntoInput = mock(() => {})
    const dismissTask = mock(() => {})

    const handlers = createPromptInputFooterBindingHandlers(
      {
        tasksSelected: true,
        isAnthropicUser: true,
        coordinatorTaskCount: 2,
        coordinatorTaskIndex: 1,
        minCoordinatorIndex: 0,
        isTeammateMode: false,
        teammateCount: 0,
        viewSelectionMode: 'viewing-agent',
        footerItemSelected: 'tasks',
        buddyEnabled: false,
        teammateFooterIndex: 0,
        viewingAgentTaskId: 'task-1',
        input: 'ab',
        cursorOffset: 1,
      },
      {
        decrementCoordinatorTaskIndex: () => {},
        incrementCoordinatorTaskIndex: () => {},
        navigateFooterUp: () => {},
        navigateFooterDown: () => {},
        cycleTeammateForward: () => {},
        cycleTeammateBackward: () => {},
        clearSelection: () => {},
        submitBuddy: () => {},
        exitTeammateView: () => {},
        enterTeammateView: () => {},
        getTeammateIdAtIndex: () => undefined,
        getVisibleTaskIdAtIndex: () => undefined,
        getVisibleTaskAtIndex: () => ({ id: 'task-1', status: 'running' }),
        openBashesDialog: () => {},
        toggleTmuxPanel: () => {},
        openTeamsDialog: () => {},
        openBridgeDialog: () => {},
        typeIntoInput,
        dismissTask,
      },
    )

    const handled = handlers['footer:close']()

    expect(handled).toBe(true)
    expect(typeIntoInput).toHaveBeenCalledWith('axb', 2)
    expect(dismissTask).not.toHaveBeenCalled()
  })
})
