import type { ToolPermissionContext } from '../../Tool.js'
import type { PermissionMode } from '../../utils/permissions/PermissionMode.js'
import type { PromptInputModeCyclePlan } from './promptInputModeCyclePlan.js'

export function dispatchPromptInputModeCycle(
  {
    cyclePlan,
    viewingAgentTaskId,
    currentMode,
    showAutoModeOptIn,
    helpOpen,
    teamName,
  }: {
    cyclePlan: PromptInputModeCyclePlan
    viewingAgentTaskId: string | null | undefined
    currentMode: PermissionMode
    showAutoModeOptIn: boolean
    helpOpen: boolean
    teamName?: string
  },
  {
    logModeCycle,
    logAutoModeOptInDialogDecline,
    logAutoModeDebug,
    updateViewedTeammateMode,
    setPreviousModeBeforeAuto,
    previewAutoMode,
    clearAutoModeOptInTimeout,
    scheduleAutoModeOptInDialog,
    setShowAutoModeOptIn,
    trackPlanModeUse,
    applyPermissionContext,
    syncTeammateMode,
    closeHelp,
  }: {
    logModeCycle: (nextMode: PermissionMode) => void
    logAutoModeOptInDialogDecline: () => void
    logAutoModeDebug: (message: string) => void
    updateViewedTeammateMode: (
      taskId: string,
      nextMode: PermissionMode,
    ) => void
    setPreviousModeBeforeAuto: (mode: PermissionMode | null) => void
    previewAutoMode: () => void
    clearAutoModeOptInTimeout: () => void
    scheduleAutoModeOptInDialog: () => void
    setShowAutoModeOptIn: (value: boolean) => void
    trackPlanModeUse: () => void
    applyPermissionContext: (
      context: ToolPermissionContext,
      nextMode: PermissionMode,
    ) => void
    syncTeammateMode: (mode: PermissionMode, teamName?: string) => void
    closeHelp: () => void
  },
): void {
  if (cyclePlan.kind === 'update_teammate_mode') {
    logModeCycle(cyclePlan.nextMode)
    if (viewingAgentTaskId) {
      updateViewedTeammateMode(viewingAgentTaskId, cyclePlan.nextMode)
    }
    if (helpOpen) {
      closeHelp()
    }
    return
  }

  logAutoModeDebug(
    `[auto-mode] handleCycleMode: currentMode=${currentMode} showAutoModeOptIn=${showAutoModeOptIn}`,
  )

  if (cyclePlan.kind === 'preview_auto_mode') {
    setPreviousModeBeforeAuto(currentMode)
    previewAutoMode()
    clearAutoModeOptInTimeout()
    scheduleAutoModeOptInDialog()
    if (helpOpen) {
      closeHelp()
    }
    return
  }

  if (cyclePlan.shouldDismissAutoModeOptIn) {
    if (showAutoModeOptIn) {
      logAutoModeOptInDialogDecline()
    }
    setShowAutoModeOptIn(false)
    clearAutoModeOptInTimeout()
    setPreviousModeBeforeAuto(null)
  }

  logModeCycle(cyclePlan.nextMode)

  if (cyclePlan.shouldTrackPlanModeUse) {
    trackPlanModeUse()
  }

  applyPermissionContext(cyclePlan.preparedContext, cyclePlan.nextMode)
  syncTeammateMode(cyclePlan.nextMode, teamName)
  if (helpOpen) {
    closeHelp()
  }
}

export function dispatchPromptInputAutoModeOptInAccept(
  {
    strippedContext,
    helpOpen,
  }: {
    strippedContext: ToolPermissionContext | null
    helpOpen: boolean
  },
  {
    setShowAutoModeOptIn,
    setPreviousModeBeforeAuto,
    applyAutoModeContext,
    closeHelp,
  }: {
    setShowAutoModeOptIn: (value: boolean) => void
    setPreviousModeBeforeAuto: (mode: PermissionMode | null) => void
    applyAutoModeContext: (context: ToolPermissionContext) => void
    closeHelp: () => void
  },
): boolean {
  if (!strippedContext) {
    return false
  }

  setShowAutoModeOptIn(false)
  setPreviousModeBeforeAuto(null)
  applyAutoModeContext(strippedContext)
  if (helpOpen) {
    closeHelp()
  }
  return true
}

export function dispatchPromptInputAutoModeOptInDecline(
  {
    previousMode,
  }: {
    previousMode: PermissionMode | null
  },
  {
    logAutoModeDebug,
    setShowAutoModeOptIn,
    clearAutoModeOptInTimeout,
    setAutoModeActive,
    applyDeclinedAutoMode,
    setPreviousModeBeforeAuto,
  }: {
    logAutoModeDebug: (message: string) => void
    setShowAutoModeOptIn: (value: boolean) => void
    clearAutoModeOptInTimeout: () => void
    setAutoModeActive: (value: boolean) => void
    applyDeclinedAutoMode: (previousMode: PermissionMode) => void
    setPreviousModeBeforeAuto: (mode: PermissionMode | null) => void
  },
): boolean {
  if (previousMode === null) {
    return false
  }

  logAutoModeDebug(
    `[auto-mode] handleAutoModeOptInDecline: reverting to ${previousMode}, setting isAutoModeAvailable=false`,
  )
  setShowAutoModeOptIn(false)
  clearAutoModeOptInTimeout()
  setAutoModeActive(false)
  applyDeclinedAutoMode(previousMode)
  setPreviousModeBeforeAuto(null)
  return true
}
