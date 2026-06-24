import { describe, expect, test } from 'bun:test'

import {
  dispatchPromptInputFooterClose,
  dispatchPromptInputFooterDown,
  dispatchPromptInputFooterNext,
  dispatchPromptInputFooterOpenSelected,
  dispatchPromptInputFooterPrevious,
  dispatchPromptInputFooterUp,
} from './promptInputFooterKeyDispatch.js'

describe('dispatchPromptInputFooterUp', () => {
  test('preserves coordinator-list decrement priority', () => {
    const events: string[] = []
    dispatchPromptInputFooterUp(
      {
        tasksSelected: true,
        isAnthropicUser: true,
        coordinatorTaskCount: 3,
        coordinatorTaskIndex: 2,
        minCoordinatorIndex: 0,
      },
      {
        decrementCoordinatorTaskIndex: () => {
          events.push('coordinator:dec')
        },
        navigateFooterUp: () => {
          events.push('footer:up')
        },
      },
    )
    expect(events).toEqual(['coordinator:dec'])
  })
})

describe('dispatchPromptInputFooterDown', () => {
  test('opens bashes dialog from tasks pill in non-teammate mode', () => {
    const events: string[] = []
    dispatchPromptInputFooterDown(
      {
        tasksSelected: true,
        isAnthropicUser: false,
        coordinatorTaskCount: 0,
        coordinatorTaskIndex: 0,
        isTeammateMode: false,
      },
      {
        incrementCoordinatorTaskIndex: () => {
          events.push('coordinator:inc')
        },
        openBashesDialog: () => {
          events.push('dialog:bashes')
        },
        clearSelection: () => {
          events.push('selection:clear')
        },
        navigateFooterDown: () => {
          events.push('footer:down')
        },
      },
    )
    expect(events).toEqual(['dialog:bashes', 'selection:clear'])
  })
})

describe('dispatchPromptInputFooterNext/Previous', () => {
  test('cycles teammate footer index when tasks pill is selected in teammate mode', () => {
    const events: string[] = []
    dispatchPromptInputFooterNext(
      {
        tasksSelected: true,
        isTeammateMode: true,
        teammateCount: 2,
      },
      {
        cycleTeammateForward: total => {
          events.push(`next:${total}`)
        },
        navigateFooterDown: () => {
          events.push('footer:down')
        },
      },
    )
    dispatchPromptInputFooterPrevious(
      {
        tasksSelected: true,
        isTeammateMode: true,
        teammateCount: 2,
      },
      {
        cycleTeammateBackward: total => {
          events.push(`prev:${total}`)
        },
        navigateFooterUp: () => {
          events.push('footer:up')
        },
      },
    )
    expect(events).toEqual(['next:3', 'prev:3'])
  })
})

describe('dispatchPromptInputFooterOpenSelected', () => {
  test('preserves companion launch ordering', () => {
    const events: string[] = []
    dispatchPromptInputFooterOpenSelected(
      {
        viewSelectionMode: null,
        footerItemSelected: 'companion',
        buddyEnabled: true,
        isTeammateMode: false,
        teammateFooterIndex: 0,
        coordinatorTaskIndex: 0,
        coordinatorTaskCount: 0,
      },
      {
        clearSelection: () => {
          events.push('selection:clear')
        },
        submitBuddy: () => {
          events.push('submit:/buddy')
        },
        exitTeammateView: () => {
          events.push('exit')
        },
        enterTeammateView: taskId => {
          events.push(`enter:${taskId}`)
        },
        getTeammateIdAtIndex: () => undefined,
        getVisibleTaskIdAtIndex: () => undefined,
        openBashesDialog: () => {
          events.push('dialog:bashes')
        },
        toggleTmuxPanel: () => {
          events.push('tmux')
        },
        openTeamsDialog: () => {
          events.push('teams')
        },
        openBridgeDialog: () => {
          events.push('bridge')
        },
      },
    )
    expect(events).toEqual(['selection:clear', 'submit:/buddy'])
  })

  test('preserves tasks pill open behavior in non-teammate mode', () => {
    const events: string[] = []
    dispatchPromptInputFooterOpenSelected(
      {
        viewSelectionMode: null,
        footerItemSelected: 'tasks',
        buddyEnabled: false,
        isTeammateMode: false,
        teammateFooterIndex: 0,
        coordinatorTaskIndex: 2,
        coordinatorTaskCount: 3,
      },
      {
        clearSelection: () => {
          events.push('selection:clear')
        },
        submitBuddy: () => {
          events.push('submit')
        },
        exitTeammateView: () => {
          events.push('exit')
        },
        enterTeammateView: taskId => {
          events.push(`enter:${taskId}`)
        },
        getTeammateIdAtIndex: () => undefined,
        getVisibleTaskIdAtIndex: index => (index === 1 ? 'task-2' : undefined),
        openBashesDialog: () => {
          events.push('dialog:bashes')
        },
        toggleTmuxPanel: () => {
          events.push('tmux')
        },
        openTeamsDialog: () => {
          events.push('teams')
        },
        openBridgeDialog: () => {
          events.push('bridge')
        },
      },
    )
    expect(events).toEqual(['enter:task-2'])
  })
})

describe('dispatchPromptInputFooterClose', () => {
  test('preserves steering x insertion when closing the viewed agent row', () => {
    const events: string[] = []
    const handled = dispatchPromptInputFooterClose(
      {
        tasksSelected: true,
        coordinatorTaskIndex: 1,
        viewSelectionMode: 'viewing-agent',
        viewingAgentTaskId: 'task-1',
        input: 'ab',
        cursorOffset: 1,
      },
      {
        getVisibleTaskAtIndex: () => ({
          id: 'task-1',
          status: 'running',
        }),
        typeIntoInput: (nextInput, nextCursorOffset) => {
          events.push(`type:${nextInput}:${nextCursorOffset}`)
        },
        dismissTask: taskId => {
          events.push(`dismiss:${taskId}`)
        },
        decrementCoordinatorTaskIndex: () => {
          events.push('coordinator:dec')
        },
      },
    )
    expect(handled).toBe(true)
    expect(events).toEqual(['type:axb:2'])
  })

  test('dismisses non-running tasks and decrements the coordinator index', () => {
    const events: string[] = []
    const handled = dispatchPromptInputFooterClose(
      {
        tasksSelected: true,
        coordinatorTaskIndex: 1,
        viewSelectionMode: null,
        viewingAgentTaskId: null,
        input: 'ab',
        cursorOffset: 1,
      },
      {
        getVisibleTaskAtIndex: () => ({
          id: 'task-2',
          status: 'done',
        }),
        typeIntoInput: (nextInput, nextCursorOffset) => {
          events.push(`type:${nextInput}:${nextCursorOffset}`)
        },
        dismissTask: taskId => {
          events.push(`dismiss:${taskId}`)
        },
        decrementCoordinatorTaskIndex: () => {
          events.push('coordinator:dec')
        },
      },
    )
    expect(handled).toBe(true)
    expect(events).toEqual(['dismiss:task-2', 'coordinator:dec'])
  })
})
