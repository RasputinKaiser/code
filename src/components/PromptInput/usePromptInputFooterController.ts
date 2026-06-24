import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useMemo } from 'react'
import { useAppState, useSetAppState } from 'src/state/AppState.js'
import type { FooterItem } from 'src/state/AppStateStore.js'
import type { TaskState } from 'src/tasks/types.js'
import { count } from '../../utils/array.js'
import { shouldHideTasksFooter } from '../tasks/taskStatusUtils.js'
import { isInternalBuild } from 'src/capabilities/static.js'
import {
  deriveFooterItems,
  getVisibleFooterSelection,
} from './promptFooterState.js'
import {
  dispatchPromptInputFooterNavigate,
  dispatchPromptInputFooterSelect,
  dispatchPromptInputFooterVisibilitySync,
} from './promptInputFooterSelectionDispatch.js'

export function usePromptInputFooterController({
  tasks,
  coordinatorTaskCount,
  showSpinnerTree,
  tmuxFooterVisible,
  bagelFooterVisible,
  teamsFooterVisible,
  bridgeFooterVisible,
  companionFooterVisible,
  minCoordinatorIndex,
  setTeammateFooterIndex,
  setCoordinatorTaskIndex,
}: {
  tasks: Record<string, TaskState>
  coordinatorTaskCount: number
  showSpinnerTree: boolean
  tmuxFooterVisible: boolean
  bagelFooterVisible: boolean
  teamsFooterVisible: boolean
  bridgeFooterVisible: boolean
  companionFooterVisible: boolean
  minCoordinatorIndex: number
  setTeammateFooterIndex: Dispatch<SetStateAction<number>>
  setCoordinatorTaskIndex: Dispatch<SetStateAction<number>>
}) {
  const setAppState = useSetAppState()
  const runningTaskCount = useMemo(
    () => count(Object.values(tasks), task => task.status === 'running'),
    [tasks],
  )
  const tasksFooterVisible = useMemo(
    () =>
      (runningTaskCount > 0 ||
        (isInternalBuild() && coordinatorTaskCount > 0)) &&
      !shouldHideTasksFooter(tasks, showSpinnerTree),
    [runningTaskCount, coordinatorTaskCount, tasks, showSpinnerTree],
  )
  const footerItems = useMemo(
    () =>
      deriveFooterItems({
        tasks: tasksFooterVisible,
        tmux: tmuxFooterVisible,
        bagel: bagelFooterVisible,
        teams: teamsFooterVisible,
        bridge: bridgeFooterVisible,
        companion: companionFooterVisible,
      }),
    [
      tasksFooterVisible,
      tmuxFooterVisible,
      bagelFooterVisible,
      teamsFooterVisible,
      bridgeFooterVisible,
      companionFooterVisible,
    ],
  )

  const rawFooterSelection = useAppState(state => state.footerSelection)
  const footerItemSelected = getVisibleFooterSelection(
    rawFooterSelection,
    footerItems,
  )
  const clearFooterSelection = useCallback(() => {
    setAppState(prev =>
      prev.footerSelection === null
        ? prev
        : {
            ...prev,
            footerSelection: null,
          },
    )
  }, [setAppState])
  const setFooterSelection = useCallback(
    (item: FooterItem | null) => {
      setAppState(prev =>
        prev.footerSelection === item
          ? prev
          : {
              ...prev,
              footerSelection: item,
            },
      )
    },
    [setAppState],
  )

  useEffect(() => {
    dispatchPromptInputFooterVisibilitySync(
      {
        rawFooterSelection,
        footerItemSelected,
      },
      {
        clearFooterSelection,
      },
    )
  }, [rawFooterSelection, footerItemSelected, clearFooterSelection])

  const selectFooterItem = useCallback(
    (item: FooterItem | null): void => {
      dispatchPromptInputFooterSelect(
        {
          item,
          minCoordinatorIndex,
        },
        {
          setFooterSelection,
          setTeammateFooterIndex,
          setCoordinatorTaskIndex,
        },
      )
    },
    [
      minCoordinatorIndex,
      setFooterSelection,
      setTeammateFooterIndex,
      setCoordinatorTaskIndex,
    ],
  )

  const navigateFooter = useCallback(
    (delta: 1 | -1, exitAtStart = false): boolean =>
      dispatchPromptInputFooterNavigate(
        {
          footerItems,
          footerItemSelected,
          delta,
          exitAtStart,
        },
        {
          selectFooterItem,
        },
      ),
    [footerItems, footerItemSelected, selectFooterItem],
  )

  const isFooterSelectionVisible = useCallback(
    (selection: FooterItem | null): boolean =>
      !!(selection && footerItems.includes(selection)),
    [footerItems],
  )

  return {
    footerItems,
    footerItemSelected,
    tasksSelected: footerItemSelected === 'tasks',
    tmuxSelected: footerItemSelected === 'tmux',
    bagelSelected: footerItemSelected === 'bagel',
    teamsSelected: footerItemSelected === 'teams',
    bridgeSelected: footerItemSelected === 'bridge',
    clearFooterSelection,
    selectFooterItem,
    navigateFooter,
    isFooterSelectionVisible,
  }
}
