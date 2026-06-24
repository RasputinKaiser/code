import { afterEach, describe, expect, it } from 'bun:test'
import type { ToolPermissionContext } from '../../Tool.js'
import {
  resolveAutoModeOptInAcceptPlan,
  resolveAutoModeOptInDeclinePlan,
  resolvePromptInputModeCyclePlan,
} from './promptInputModeCyclePlan.js'

function createToolPermissionContext(
  overrides: Partial<ToolPermissionContext> = {},
): ToolPermissionContext {
  return {
    mode: 'default',
    alwaysAllowModeEnabled: false,
    alwaysAllowModeActive: false,
    isBypassPermissionsModeAvailable: false,
    isAutoModeAvailable: false,
    additionalWorkingDirectories: new Map(),
    toolChoiceContext: 'prompt',
    permissionRules: {},
    ...overrides,
  } as ToolPermissionContext
}

const originalUserType = process.env.USER_TYPE

afterEach(() => {
  if (originalUserType === undefined) {
    delete process.env.USER_TYPE
  } else {
    process.env.USER_TYPE = originalUserType
  }
})

describe('resolvePromptInputModeCyclePlan', () => {
  it('cycles the viewed teammate mode independently from the leader', () => {
    expect(
      resolvePromptInputModeCyclePlan({
        swarmsEnabled: true,
        viewedTeammatePermissionMode: 'plan',
        viewingAgentTaskId: 'task-1',
        toolPermissionContext: createToolPermissionContext({
          mode: 'default',
        }),
        transcriptClassifierEnabled: false,
        hasAutoModeOptIn: false,
        showAutoModeOptIn: false,
        hasPendingAutoModeOptInTimeout: false,
      }),
    ).toEqual({
      kind: 'update_teammate_mode',
      nextMode: 'default',
    })
  })

  it('returns the preview path for first-time auto mode entry', () => {
    expect(
      resolvePromptInputModeCyclePlan({
        swarmsEnabled: false,
        viewedTeammatePermissionMode: null,
        viewingAgentTaskId: null,
        toolPermissionContext: createToolPermissionContext({
          mode: 'bypassPermissions',
          isAutoModeAvailable: true,
          isBypassPermissionsModeAvailable: true,
        }),
        transcriptClassifierEnabled: true,
        hasAutoModeOptIn: false,
        showAutoModeOptIn: false,
        hasPendingAutoModeOptInTimeout: false,
        computedNextMode: 'auto',
      }),
    ).toEqual({
      kind: 'preview_auto_mode',
      nextMode: 'auto',
    })
  })

  it('uses USER_TYPE=noumena as the NCode internal mode-cycle signal', () => {
    process.env.USER_TYPE = 'noumena'

    const result = resolvePromptInputModeCyclePlan({
      swarmsEnabled: false,
      viewedTeammatePermissionMode: null,
      viewingAgentTaskId: null,
      toolPermissionContext: createToolPermissionContext({
        mode: 'default',
        isBypassPermissionsModeAvailable: true,
      }),
      transcriptClassifierEnabled: true,
      hasAutoModeOptIn: true,
      showAutoModeOptIn: false,
      hasPendingAutoModeOptInTimeout: false,
    })

    expect(result.kind).toBe('apply_cycle')
    if (result.kind !== 'apply_cycle') {
      throw new Error('expected apply_cycle result')
    }
    expect(result.nextMode).toBe('bypassPermissions')
  })

  it('does not treat legacy USER_TYPE=ant as an NCode internal user signal', () => {
    process.env.USER_TYPE = 'ant'

    const result = resolvePromptInputModeCyclePlan({
      swarmsEnabled: false,
      viewedTeammatePermissionMode: null,
      viewingAgentTaskId: null,
      toolPermissionContext: createToolPermissionContext({
        mode: 'default',
        isBypassPermissionsModeAvailable: true,
      }),
      transcriptClassifierEnabled: true,
      hasAutoModeOptIn: true,
      showAutoModeOptIn: false,
      hasPendingAutoModeOptInTimeout: false,
    })

    expect(result.kind).toBe('apply_cycle')
    if (result.kind !== 'apply_cycle') {
      throw new Error('expected apply_cycle result')
    }
    expect(result.nextMode).toBe('acceptEdits')
  })

  it('returns the normal apply path and marks pending auto dialogs for dismissal', () => {
    const result = resolvePromptInputModeCyclePlan({
      swarmsEnabled: false,
      viewedTeammatePermissionMode: null,
      viewingAgentTaskId: null,
      toolPermissionContext: createToolPermissionContext({
        mode: 'auto',
        isAutoModeAvailable: true,
      }),
      transcriptClassifierEnabled: true,
      hasAutoModeOptIn: true,
      showAutoModeOptIn: true,
      hasPendingAutoModeOptInTimeout: false,
    })

    expect(result.kind).toBe('apply_cycle')
    if (result.kind !== 'apply_cycle') {
      throw new Error('expected apply_cycle result')
    }
    expect(result.nextMode).toBe('default')
    expect(result.shouldDismissAutoModeOptIn).toBe(true)
    expect(result.shouldTrackPlanModeUse).toBe(false)
  })

  it('marks plan-mode transitions so PromptInput can record usage', () => {
    const result = resolvePromptInputModeCyclePlan({
      swarmsEnabled: false,
      viewedTeammatePermissionMode: null,
      viewingAgentTaskId: null,
      toolPermissionContext: createToolPermissionContext({
        mode: 'acceptEdits',
      }),
      transcriptClassifierEnabled: false,
      hasAutoModeOptIn: false,
      showAutoModeOptIn: false,
      hasPendingAutoModeOptInTimeout: false,
    })

    expect(result.kind).toBe('apply_cycle')
    if (result.kind !== 'apply_cycle') {
      throw new Error('expected apply_cycle result')
    }
    expect(result.nextMode).toBe('plan')
    expect(result.shouldTrackPlanModeUse).toBe(true)
  })
})

describe('resolveAutoModeOptInAcceptPlan', () => {
  it('builds the stripped auto-mode context from the previous mode when available', () => {
    const result = resolveAutoModeOptInAcceptPlan({
      transcriptClassifierEnabled: true,
      previousModeBeforeAuto: 'default',
      toolPermissionContext: createToolPermissionContext({
        mode: 'auto',
        isAutoModeAvailable: true,
      }),
    })

    expect(result).not.toBeNull()
    expect(result?.mode).toBe('auto')
  })
})

describe('resolveAutoModeOptInDeclinePlan', () => {
  it('returns the previous mode when declining the auto-mode dialog', () => {
    expect(
      resolveAutoModeOptInDeclinePlan({
        transcriptClassifierEnabled: true,
        previousModeBeforeAuto: 'plan',
      }),
    ).toBe('plan')
  })
})
