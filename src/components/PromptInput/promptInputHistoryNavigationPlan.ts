import type { FooterItem } from 'src/state/AppStateStore.js'

export type PromptInputHistoryUpAction = 'noop' | 'pop_queue' | 'history_up'

export function resolvePromptInputHistoryUpAction({
  suggestionCount,
  isCursorOnFirstLine,
  hasEditableQueuedCommand,
}: {
  suggestionCount: number
  isCursorOnFirstLine: boolean
  hasEditableQueuedCommand: boolean
}): PromptInputHistoryUpAction {
  if (suggestionCount > 1 || !isCursorOnFirstLine) {
    return 'noop'
  }

  if (hasEditableQueuedCommand) {
    return 'pop_queue'
  }

  return 'history_up'
}

export function shouldHandlePromptInputHistoryDown({
  suggestionCount,
  isCursorOnLastLine,
}: {
  suggestionCount: number
  isCursorOnLastLine: boolean
}): boolean {
  return suggestionCount <= 1 && isCursorOnLastLine
}

export function resolvePromptInputFooterEntryPlan({
  enteredFooter,
  footerItems,
}: {
  enteredFooter: boolean
  footerItems: FooterItem[]
}): {
  shouldSelectFooterItem: boolean
  footerItem: FooterItem | null
  shouldMarkTasksHintSeen: boolean
} {
  if (!enteredFooter || footerItems.length === 0) {
    return {
      shouldSelectFooterItem: false,
      footerItem: null,
      shouldMarkTasksHintSeen: false,
    }
  }

  const footerItem = footerItems[0]!
  return {
    shouldSelectFooterItem: true,
    footerItem,
    shouldMarkTasksHintSeen: footerItem === 'tasks',
  }
}
