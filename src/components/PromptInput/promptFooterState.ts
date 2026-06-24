import type { FooterItem } from 'src/state/AppStateStore.js'

export function deriveFooterItems(flags: {
  tasks: boolean
  tmux: boolean
  bagel: boolean
  teams: boolean
  bridge: boolean
  companion: boolean
}): FooterItem[] {
  return [
    flags.tasks && 'tasks',
    flags.tmux && 'tmux',
    flags.bagel && 'bagel',
    flags.teams && 'teams',
    flags.bridge && 'bridge',
    flags.companion && 'companion',
  ].filter(Boolean) as FooterItem[]
}

export function getVisibleFooterSelection(
  rawSelection: FooterItem | null | undefined,
  footerItems: FooterItem[],
): FooterItem | null {
  return rawSelection && footerItems.includes(rawSelection) ? rawSelection : null
}

export function navigateFooterSelection(
  footerItems: FooterItem[],
  selectedItem: FooterItem | null,
  delta: 1 | -1,
  exitAtStart = false,
): {
  handled: boolean
  nextSelection: FooterItem | null
} {
  const currentIndex = selectedItem ? footerItems.indexOf(selectedItem) : -1
  const nextSelection = footerItems[currentIndex + delta]

  if (nextSelection) {
    return {
      handled: true,
      nextSelection,
    }
  }

  if (delta < 0 && exitAtStart) {
    return {
      handled: true,
      nextSelection: null,
    }
  }

  return {
    handled: false,
    nextSelection: selectedItem,
  }
}
