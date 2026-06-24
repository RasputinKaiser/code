import type { ToolPermissionContext } from '../../Tool.js'
import {
  cyclePermissionMode,
  getNextPermissionMode,
} from '../../utils/permissions/getNextPermissionMode.js'
import type { PermissionMode } from '../../utils/permissions/PermissionMode.js'
import { transitionPermissionMode } from '../../utils/permissions/permissionSetup.js'

type TeamContextForModeCycle = {
  leadAgentId: string
}

export type PromptInputModeCyclePlan =
  | {
      kind: 'update_teammate_mode'
      nextMode: PermissionMode
    }
  | {
      kind: 'preview_auto_mode'
      nextMode: 'auto'
    }
  | {
      kind: 'apply_cycle'
      nextMode: PermissionMode
      preparedContext: ToolPermissionContext
      shouldDismissAutoModeOptIn: boolean
      shouldTrackPlanModeUse: boolean
    }

type ResolvePromptInputModeCyclePlanParams = {
  swarmsEnabled: boolean
  viewedTeammatePermissionMode: PermissionMode | null | undefined
  viewingAgentTaskId: string | null | undefined
  toolPermissionContext: ToolPermissionContext
  teamContext?: TeamContextForModeCycle
  transcriptClassifierEnabled: boolean
  hasAutoModeOptIn: boolean
  showAutoModeOptIn: boolean
  hasPendingAutoModeOptInTimeout: boolean
  computedNextMode?: PermissionMode
  preparedContextOverride?: ToolPermissionContext
}

export function resolvePromptInputModeCyclePlan({
  swarmsEnabled,
  viewedTeammatePermissionMode,
  viewingAgentTaskId,
  toolPermissionContext,
  teamContext,
  transcriptClassifierEnabled,
  hasAutoModeOptIn,
  showAutoModeOptIn,
  hasPendingAutoModeOptInTimeout,
  computedNextMode,
  preparedContextOverride,
}: ResolvePromptInputModeCyclePlanParams): PromptInputModeCyclePlan {
  if (swarmsEnabled && viewedTeammatePermissionMode && viewingAgentTaskId) {
    const nextMode = getNextPermissionMode(
      {
        ...toolPermissionContext,
        mode: viewedTeammatePermissionMode,
      },
      undefined,
    )
    return {
      kind: 'update_teammate_mode',
      nextMode,
    }
  }

  const nextMode =
    computedNextMode ?? getNextPermissionMode(toolPermissionContext, teamContext)
  const shouldPreviewAutoMode =
    transcriptClassifierEnabled &&
    nextMode === 'auto' &&
    toolPermissionContext.mode !== 'auto' &&
    !hasAutoModeOptIn &&
    !viewingAgentTaskId

  if (shouldPreviewAutoMode) {
    return {
      kind: 'preview_auto_mode',
      nextMode: 'auto',
    }
  }

  const preparedContext =
    preparedContextOverride ??
    cyclePermissionMode(toolPermissionContext, teamContext).context

  return {
    kind: 'apply_cycle',
    nextMode,
    preparedContext,
    shouldDismissAutoModeOptIn:
      transcriptClassifierEnabled &&
      (showAutoModeOptIn || hasPendingAutoModeOptInTimeout),
    shouldTrackPlanModeUse: nextMode === 'plan',
  }
}

type ResolveAutoModeOptInAcceptPlanParams = {
  transcriptClassifierEnabled: boolean
  previousModeBeforeAuto: PermissionMode | null
  toolPermissionContext: ToolPermissionContext
}

export function resolveAutoModeOptInAcceptPlan({
  transcriptClassifierEnabled,
  previousModeBeforeAuto,
  toolPermissionContext,
}: ResolveAutoModeOptInAcceptPlanParams): ToolPermissionContext | null {
  if (!transcriptClassifierEnabled) {
    return null
  }

  return transitionPermissionMode(
    previousModeBeforeAuto ?? toolPermissionContext.mode,
    'auto',
    toolPermissionContext,
  )
}

type ResolveAutoModeOptInDeclinePlanParams = {
  transcriptClassifierEnabled: boolean
  previousModeBeforeAuto: PermissionMode | null
}

export function resolveAutoModeOptInDeclinePlan({
  transcriptClassifierEnabled,
  previousModeBeforeAuto,
}: ResolveAutoModeOptInDeclinePlanParams): PermissionMode | null {
  if (!transcriptClassifierEnabled) {
    return null
  }

  return previousModeBeforeAuto
}
