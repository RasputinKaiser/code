import type { FooterItem } from 'src/state/AppStateStore.js'
import { navigateFooterSelection } from './promptFooterState.js'

export function dispatchPromptInputFooterVisibilitySync(
  {
    rawFooterSelection,
    footerItemSelected,
  }: {
    rawFooterSelection: FooterItem | null | undefined
    footerItemSelected: FooterItem | null
  },
  {
    clearFooterSelection,
  }: {
    clearFooterSelection: () => void
  },
): void {
  if (rawFooterSelection && !footerItemSelected) {
    clearFooterSelection()
  }
}

export function dispatchPromptInputFooterSelect(
  {
    item,
    minCoordinatorIndex,
  }: {
    item: FooterItem | null
    minCoordinatorIndex: number
  },
  {
    setFooterSelection,
    setTeammateFooterIndex,
    setCoordinatorTaskIndex,
  }: {
    setFooterSelection: (item: FooterItem | null) => void
    setTeammateFooterIndex: (index: number) => void
    setCoordinatorTaskIndex: (index: number) => void
  },
): void {
  setFooterSelection(item)
  if (item === 'tasks') {
    setTeammateFooterIndex(0)
    setCoordinatorTaskIndex(minCoordinatorIndex)
  }
}

export function dispatchPromptInputFooterNavigate(
  {
    footerItems,
    footerItemSelected,
    delta,
    exitAtStart,
  }: {
    footerItems: FooterItem[]
    footerItemSelected: FooterItem | null
    delta: 1 | -1
    exitAtStart?: boolean
  },
  {
    selectFooterItem,
  }: {
    selectFooterItem: (item: FooterItem | null) => void
  },
): boolean {
  const result = navigateFooterSelection(
    footerItems,
    footerItemSelected,
    delta,
    exitAtStart,
  )
  if (!result.handled) {
    return false
  }
  selectFooterItem(result.nextSelection)
  return true
}
