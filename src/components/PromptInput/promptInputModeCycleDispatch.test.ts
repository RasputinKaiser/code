import { describe, expect, test } from 'bun:test'

import {
  dispatchPromptInputAutoModeOptInAccept,
  dispatchPromptInputAutoModeOptInDecline,
  dispatchPromptInputModeCycle,
} from './promptInputModeCycleDispatch.js'

describe('dispatchPromptInputModeCycle', () => {
  test('preserves teammate mode updates and help dismissal ordering', () => {
    const events: string[] = []

    dispatchPromptInputModeCycle(
      {
        cyclePlan: {
          kind: 'update_teammate_mode',
          nextMode: 'plan',
        },
        viewingAgentTaskId: 'task-1',
        currentMode: 'default',
        showAutoModeOptIn: false,
        helpOpen: true,
        teamName: 'alpha',
      },
      {
        logModeCycle: nextMode => {
          events.push(`log:${nextMode}`)
        },
        logAutoModeOptInDialogDecline: () => {
          events.push('decline')
        },
        logAutoModeDebug: message => {
          events.push(`debug:${message}`)
        },
        updateViewedTeammateMode: (taskId, nextMode) => {
          events.push(`teammate:${taskId}:${nextMode}`)
        },
        setPreviousModeBeforeAuto: mode => {
          events.push(`prev:${mode}`)
        },
        previewAutoMode: () => {
          events.push('preview')
        },
        clearAutoModeOptInTimeout: () => {
          events.push('timeout:clear')
        },
        scheduleAutoModeOptInDialog: () => {
          events.push('timeout:schedule')
        },
        setShowAutoModeOptIn: value => {
          events.push(`show:${value}`)
        },
        trackPlanModeUse: () => {
          events.push('track:plan')
        },
        applyPermissionContext: (_context, nextMode) => {
          events.push(`apply:${nextMode}`)
        },
        syncTeammateMode: (mode, teamName) => {
          events.push(`sync:${mode}:${teamName}`)
        },
        closeHelp: () => {
          events.push('help:close')
        },
      },
    )

    expect(events).toEqual([
      'log:plan',
      'teammate:task-1:plan',
      'help:close',
    ])
  })

  test('preserves preview-auto-mode ordering', () => {
    const events: string[] = []

    dispatchPromptInputModeCycle(
      {
        cyclePlan: {
          kind: 'preview_auto_mode',
          nextMode: 'auto',
        },
        viewingAgentTaskId: null,
        currentMode: 'acceptEdits',
        showAutoModeOptIn: false,
        helpOpen: true,
      },
      {
        logModeCycle: nextMode => {
          events.push(`log:${nextMode}`)
        },
        logAutoModeOptInDialogDecline: () => {
          events.push('decline')
        },
        logAutoModeDebug: () => {
          events.push('debug')
        },
        updateViewedTeammateMode: () => {
          events.push('teammate')
        },
        setPreviousModeBeforeAuto: mode => {
          events.push(`prev:${mode}`)
        },
        previewAutoMode: () => {
          events.push('preview')
        },
        clearAutoModeOptInTimeout: () => {
          events.push('timeout:clear')
        },
        scheduleAutoModeOptInDialog: () => {
          events.push('timeout:schedule')
        },
        setShowAutoModeOptIn: value => {
          events.push(`show:${value}`)
        },
        trackPlanModeUse: () => {
          events.push('track:plan')
        },
        applyPermissionContext: () => {
          events.push('apply')
        },
        syncTeammateMode: () => {
          events.push('sync')
        },
        closeHelp: () => {
          events.push('help:close')
        },
      },
    )

    expect(events).toEqual([
      'debug',
      'prev:acceptEdits',
      'preview',
      'timeout:clear',
      'timeout:schedule',
      'help:close',
    ])
  })

  test('preserves apply-cycle dismissal, tracking, and sync ordering', () => {
    const events: string[] = []

    dispatchPromptInputModeCycle(
      {
        cyclePlan: {
          kind: 'apply_cycle',
          nextMode: 'plan',
          preparedContext: {
            mode: 'plan',
            isAutoModeAvailable: true,
          } as never,
          shouldDismissAutoModeOptIn: true,
          shouldTrackPlanModeUse: true,
        },
        viewingAgentTaskId: null,
        currentMode: 'default',
        showAutoModeOptIn: true,
        helpOpen: true,
        teamName: 'beta',
      },
      {
        logModeCycle: nextMode => {
          events.push(`log:${nextMode}`)
        },
        logAutoModeOptInDialogDecline: () => {
          events.push('decline')
        },
        logAutoModeDebug: () => {
          events.push('debug')
        },
        updateViewedTeammateMode: () => {
          events.push('teammate')
        },
        setPreviousModeBeforeAuto: mode => {
          events.push(`prev:${mode}`)
        },
        previewAutoMode: () => {
          events.push('preview')
        },
        clearAutoModeOptInTimeout: () => {
          events.push('timeout:clear')
        },
        scheduleAutoModeOptInDialog: () => {
          events.push('timeout:schedule')
        },
        setShowAutoModeOptIn: value => {
          events.push(`show:${value}`)
        },
        trackPlanModeUse: () => {
          events.push('track:plan')
        },
        applyPermissionContext: (_context, nextMode) => {
          events.push(`apply:${nextMode}`)
        },
        syncTeammateMode: (mode, teamName) => {
          events.push(`sync:${mode}:${teamName}`)
        },
        closeHelp: () => {
          events.push('help:close')
        },
      },
    )

    expect(events).toEqual([
      'debug',
      'decline',
      'show:false',
      'timeout:clear',
      'prev:null',
      'log:plan',
      'track:plan',
      'apply:plan',
      'sync:plan:beta',
      'help:close',
    ])
  })
})

describe('dispatchPromptInputAutoModeOptInAccept', () => {
  test('preserves accept ordering and closes help when a context exists', () => {
    const events: string[] = []

    const handled = dispatchPromptInputAutoModeOptInAccept(
      {
        strippedContext: {
          mode: 'auto',
          isAutoModeAvailable: true,
        } as never,
        helpOpen: true,
      },
      {
        setShowAutoModeOptIn: value => {
          events.push(`show:${value}`)
        },
        setPreviousModeBeforeAuto: mode => {
          events.push(`prev:${mode}`)
        },
        applyAutoModeContext: () => {
          events.push('apply:auto')
        },
        closeHelp: () => {
          events.push('help:close')
        },
      },
    )

    expect(handled).toBe(true)
    expect(events).toEqual([
      'show:false',
      'prev:null',
      'apply:auto',
      'help:close',
    ])
  })
})

describe('dispatchPromptInputAutoModeOptInDecline', () => {
  test('preserves decline ordering and mode rollback', () => {
    const events: string[] = []

    const handled = dispatchPromptInputAutoModeOptInDecline(
      {
        previousMode: 'default',
      },
      {
        logAutoModeDebug: () => {
          events.push('debug')
        },
        setShowAutoModeOptIn: value => {
          events.push(`show:${value}`)
        },
        clearAutoModeOptInTimeout: () => {
          events.push('timeout:clear')
        },
        setAutoModeActive: value => {
          events.push(`active:${value}`)
        },
        applyDeclinedAutoMode: previousMode => {
          events.push(`apply:${previousMode}`)
        },
        setPreviousModeBeforeAuto: mode => {
          events.push(`prev:${mode}`)
        },
      },
    )

    expect(handled).toBe(true)
    expect(events).toEqual([
      'debug',
      'show:false',
      'timeout:clear',
      'active:false',
      'apply:default',
      'prev:null',
    ])
  })
})
