import { describe, expect, test } from 'bun:test'
import {
  dispatchPromptInputFooterNavigate,
  dispatchPromptInputFooterSelect,
  dispatchPromptInputFooterVisibilitySync,
} from './promptInputFooterSelectionDispatch.js'

describe('dispatchPromptInputFooterVisibilitySync', () => {
  test('clears stale raw selection when the selected pill is no longer visible', () => {
    const events: string[] = []

    dispatchPromptInputFooterVisibilitySync(
      {
        rawFooterSelection: 'bridge',
        footerItemSelected: null,
      },
      {
        clearFooterSelection: () => {
          events.push('clear')
        },
      },
    )

    expect(events).toEqual(['clear'])
  })

  test('preserves no-op behavior when selection is already visible or empty', () => {
    const events: string[] = []

    dispatchPromptInputFooterVisibilitySync(
      {
        rawFooterSelection: 'tasks',
        footerItemSelected: 'tasks',
      },
      {
        clearFooterSelection: () => {
          events.push('clear')
        },
      },
    )

    dispatchPromptInputFooterVisibilitySync(
      {
        rawFooterSelection: null,
        footerItemSelected: null,
      },
      {
        clearFooterSelection: () => {
          events.push('clear')
        },
      },
    )

    expect(events).toEqual([])
  })
})

describe('dispatchPromptInputFooterSelect', () => {
  test('preserves tasks selection ordering and task-index reset behavior', () => {
    const events: string[] = []

    dispatchPromptInputFooterSelect(
      {
        item: 'tasks',
        minCoordinatorIndex: -1,
      },
      {
        setFooterSelection: item => {
          events.push(`selection:${item}`)
        },
        setTeammateFooterIndex: index => {
          events.push(`teammate:${index}`)
        },
        setCoordinatorTaskIndex: index => {
          events.push(`coordinator:${index}`)
        },
      },
    )

    expect(events).toEqual(['selection:tasks', 'teammate:0', 'coordinator:-1'])
  })

  test('updates only selection for non-tasks items', () => {
    const events: string[] = []

    dispatchPromptInputFooterSelect(
      {
        item: 'bridge',
        minCoordinatorIndex: 0,
      },
      {
        setFooterSelection: item => {
          events.push(`selection:${item}`)
        },
        setTeammateFooterIndex: index => {
          events.push(`teammate:${index}`)
        },
        setCoordinatorTaskIndex: index => {
          events.push(`coordinator:${index}`)
        },
      },
    )

    expect(events).toEqual(['selection:bridge'])
  })
})

describe('dispatchPromptInputFooterNavigate', () => {
  test('routes handled navigation through selectFooterItem', () => {
    const events: string[] = []

    const handled = dispatchPromptInputFooterNavigate(
      {
        footerItems: ['tasks', 'tmux'],
        footerItemSelected: null,
        delta: 1,
      },
      {
        selectFooterItem: item => {
          events.push(`select:${item}`)
        },
      },
    )

    expect(handled).toBe(true)
    expect(events).toEqual(['select:tasks'])
  })

  test('preserves boundary no-op behavior when navigation is not handled', () => {
    const events: string[] = []

    const handled = dispatchPromptInputFooterNavigate(
      {
        footerItems: ['tasks', 'tmux'],
        footerItemSelected: 'tmux',
        delta: 1,
      },
      {
        selectFooterItem: item => {
          events.push(`select:${item}`)
        },
      },
    )

    expect(handled).toBe(false)
    expect(events).toEqual([])
  })
})
