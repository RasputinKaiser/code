import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  logEvent,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
} from 'src/services/analytics/index.js'
import type { AppState } from 'src/state/AppState.js'
import type { AppStateStore } from 'src/state/AppStateStore.js'
import type { ToolPermissionContext } from '../../Tool.js'
import type { PermissionMode } from '../../types/permissions.js'
import { logForDebugging } from '../../utils/debug.js'
import { saveGlobalConfig } from '../../utils/config.js'
import { setAutoModeActive } from '../../utils/permissions/autoModeState.js'
import { syncTeammateMode } from '../../utils/swarm/teamHelpers.js'
import {
  dispatchPromptInputAutoModeOptInAccept,
  dispatchPromptInputAutoModeOptInDecline,
  dispatchPromptInputModeCycle,
} from './promptInputModeCycleDispatch.js'
import {
  resolveAutoModeOptInAcceptPlan,
  resolveAutoModeOptInDeclinePlan,
  resolvePromptInputModeCyclePlan,
} from './promptInputModeCyclePlan.js'

const AUTO_MODE_OPT_IN_DELAY_MS = 400

type TeamContext = AppState['teamContext']
type SetAppState = AppStateStore['setState']

type PermissionModeMachineProps = {
  toolPermissionContext: ToolPermissionContext
  teamContext: TeamContext | undefined
  viewingAgentTaskId: string | null | undefined
  viewedTeammate: { permissionMode: PermissionMode } | null | undefined
  helpOpen: boolean
  setHelpOpen: Dispatch<SetStateAction<boolean>>
  setAppState: SetAppState
  setToolPermissionContext: (ctx: ToolPermissionContext) => void
  swarmsEnabled: boolean
  transcriptClassifierEnabled: boolean
  hasAutoModeOptIn: () => boolean
}

export type AutoModeTimeoutRef = { current: NodeJS.Timeout | null }

export function clearAutoModeOptInTimeout(ref: AutoModeTimeoutRef): void {
  if (ref.current) {
    clearTimeout(ref.current)
    ref.current = null
  }
}

export function scheduleAutoModeOptInDialog(
  ref: AutoModeTimeoutRef,
  setShowAutoModeOptIn: (value: boolean) => void,
  delay = AUTO_MODE_OPT_IN_DELAY_MS,
): void {
  ref.current = setTimeout(() => {
    setShowAutoModeOptIn(true)
    ref.current = null
  }, delay)
}

export function usePermissionModeMachine({
  toolPermissionContext,
  teamContext,
  viewingAgentTaskId,
  viewedTeammate,
  helpOpen,
  setHelpOpen,
  setAppState,
  setToolPermissionContext,
  swarmsEnabled,
  transcriptClassifierEnabled,
  hasAutoModeOptIn,
}: PermissionModeMachineProps) {
  const [showAutoModeOptIn, setShowAutoModeOptIn] = useState(false)
  const [previousModeBeforeAuto, setPreviousModeBeforeAuto] = useState<PermissionMode | null>(null)
  const autoModeOptInTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const closeHelp = useCallback(() => {
    setHelpOpen(false)
  }, [setHelpOpen])

  const clearPendingAutoModeOptIn = useCallback(() => {
    clearAutoModeOptInTimeout(autoModeOptInTimeoutRef)
  }, [])

  useEffect(() => {
    return () => {
      clearPendingAutoModeOptIn()
    }
  }, [clearPendingAutoModeOptIn])

  const schedulePendingAutoModeOptIn = useCallback(() => {
    scheduleAutoModeOptInDialog(autoModeOptInTimeoutRef, setShowAutoModeOptIn)
  }, [])

  const handleCycleMode = useCallback(() => {
    const cyclePlan = resolvePromptInputModeCyclePlan({
      swarmsEnabled,
      viewedTeammatePermissionMode: viewedTeammate?.permissionMode,
      viewingAgentTaskId,
      toolPermissionContext,
      teamContext: teamContext ?? undefined,
      transcriptClassifierEnabled,
      hasAutoModeOptIn: hasAutoModeOptIn(),
      showAutoModeOptIn,
      hasPendingAutoModeOptInTimeout: !!autoModeOptInTimeoutRef.current,
    })

    dispatchPromptInputModeCycle(
      {
        cyclePlan,
        viewingAgentTaskId,
        currentMode: toolPermissionContext.mode,
        showAutoModeOptIn,
        helpOpen,
        teamName: teamContext?.teamName,
      },
      {
        logModeCycle: nextMode => {
          logEvent('ncode_mode_cycle', {
            to: nextMode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          })
        },
        logAutoModeOptInDialogDecline: () => {
          logEvent('ncode_auto_mode_opt_in_dialog_decline', {})
        },
        logAutoModeDebug: message => {
          logForDebugging(message)
        },
        updateViewedTeammateMode: (taskId, nextMode) => {
          setAppState(prev => {
            const task = prev.tasks[taskId]
            if (!task || task.type !== 'in_process_teammate') {
              return prev
            }
            if (task.permissionMode === nextMode) {
              return prev
            }
            return {
              ...prev,
              tasks: {
                ...prev.tasks,
                [taskId]: {
                  ...task,
                  permissionMode: nextMode,
                },
              },
            }
          })
        },
        setPreviousModeBeforeAuto,
        previewAutoMode: () => {
          setAppState(prev => ({
            ...prev,
            toolPermissionContext: {
              ...prev.toolPermissionContext,
              mode: 'auto',
            },
          }))
          setToolPermissionContext({
            ...toolPermissionContext,
            mode: 'auto',
          })
        },
        clearAutoModeOptInTimeout: clearPendingAutoModeOptIn,
        scheduleAutoModeOptInDialog: schedulePendingAutoModeOptIn,
        setShowAutoModeOptIn,
        trackPlanModeUse: () => {
          saveGlobalConfig(current => ({
            ...current,
            lastPlanModeUse: Date.now(),
          }))
        },
        applyPermissionContext: (preparedContext, nextMode) => {
          setAppState(prev => ({
            ...prev,
            toolPermissionContext: {
              ...preparedContext,
              mode: nextMode,
            },
          }))
          setToolPermissionContext({
            ...preparedContext,
            mode: nextMode,
          })
        },
        syncTeammateMode,
        closeHelp,
      },
    )
  }, [
    swarmsEnabled,
    viewedTeammate,
    viewingAgentTaskId,
    toolPermissionContext,
    teamContext,
    transcriptClassifierEnabled,
    hasAutoModeOptIn,
    showAutoModeOptIn,
    helpOpen,
    setAppState,
    setToolPermissionContext,
    clearPendingAutoModeOptIn,
    schedulePendingAutoModeOptIn,
    closeHelp,
  ])

  const handleAutoModeOptInAccept = useCallback(() => {
    const strippedContext = resolveAutoModeOptInAcceptPlan({
      transcriptClassifierEnabled,
      previousModeBeforeAuto,
      toolPermissionContext,
    })
    dispatchPromptInputAutoModeOptInAccept(
      {
        strippedContext,
        helpOpen,
      },
      {
        setShowAutoModeOptIn,
        setPreviousModeBeforeAuto,
        applyAutoModeContext: context => {
          setAppState(prev => ({
            ...prev,
            toolPermissionContext: {
              ...context,
              mode: 'auto',
            },
          }))
          setToolPermissionContext({
            ...context,
            mode: 'auto',
          })
        },
        closeHelp,
      },
    )
  }, [
    helpOpen,
    previousModeBeforeAuto,
    toolPermissionContext,
    setAppState,
    setToolPermissionContext,
    closeHelp,
    transcriptClassifierEnabled,
  ])

  const handleAutoModeOptInDecline = useCallback(() => {
    const previousMode = resolveAutoModeOptInDeclinePlan({
      transcriptClassifierEnabled,
      previousModeBeforeAuto,
    })
    dispatchPromptInputAutoModeOptInDecline(
      {
        previousMode,
      },
      {
        logAutoModeDebug: message => {
          logForDebugging(message)
        },
        setShowAutoModeOptIn,
        clearAutoModeOptInTimeout: clearPendingAutoModeOptIn,
        setAutoModeActive,
        applyDeclinedAutoMode: nextMode => {
          setAppState(prev => ({
            ...prev,
            toolPermissionContext: {
              ...prev.toolPermissionContext,
              mode: nextMode,
              isAutoModeAvailable: false,
            },
          }))
          setToolPermissionContext({
            ...toolPermissionContext,
            mode: nextMode,
            isAutoModeAvailable: false,
          })
        },
        setPreviousModeBeforeAuto,
      },
    )
  }, [
    previousModeBeforeAuto,
    toolPermissionContext,
    setAppState,
    setToolPermissionContext,
    transcriptClassifierEnabled,
    clearPendingAutoModeOptIn,
  ])

  return {
    showAutoModeOptIn,
    handleCycleMode,
    handleAutoModeOptInAccept,
    handleAutoModeOptInDecline,
  }
}
