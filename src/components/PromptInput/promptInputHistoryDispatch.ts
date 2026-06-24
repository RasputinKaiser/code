import type { FooterItem } from 'src/state/AppStateStore.js'
import {
  resolvePromptInputFooterEntryPlan,
  resolvePromptInputHistoryUpAction,
  shouldHandlePromptInputHistoryDown,
} from './promptInputHistoryNavigationPlan.js'

export function dispatchPromptInputHistoryUp(
  state: {
    suggestionCount: number
    isCursorOnFirstLine: boolean
    hasEditableQueuedCommand: boolean
  },
  deps: {
    popAllCommandsFromQueue: () => void
    onHistoryUp: () => void
  },
): void {
  const action = resolvePromptInputHistoryUpAction(state)
  if (action === 'noop') {
    return
  }

  if (action === 'pop_queue') {
    deps.popAllCommandsFromQueue()
    return
  }

  deps.onHistoryUp()
}

export function dispatchPromptInputHistoryDown(
  state: {
    suggestionCount: number
    isCursorOnLastLine: boolean
    footerItems: FooterItem[]
    hasSeenTasksHint: boolean
  },
  deps: {
    onHistoryDown: () => boolean
    selectFooterItem: (item: FooterItem) => void
    markTasksHintSeen: () => void
  },
): void {
  if (!shouldHandlePromptInputHistoryDown(state)) {
    return
  }

  const footerEntryPlan = resolvePromptInputFooterEntryPlan({
    enteredFooter: deps.onHistoryDown(),
    footerItems: state.footerItems,
  })
  if (!footerEntryPlan.shouldSelectFooterItem || !footerEntryPlan.footerItem) {
    return
  }

  deps.selectFooterItem(footerEntryPlan.footerItem)
  if (footerEntryPlan.shouldMarkTasksHintSeen && !state.hasSeenTasksHint) {
    deps.markTasksHintSeen()
  }
}
