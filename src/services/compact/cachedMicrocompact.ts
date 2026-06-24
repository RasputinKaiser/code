export type CacheEdit = {
  type: 'delete'
  cache_reference: string
}

export type CacheEditsBlock = {
  type: 'cache_edits'
  edits: CacheEdit[]
}

export type PinnedCacheEdits = {
  userMessageIndex: number
  block: CacheEditsBlock
}

export type CachedMCConfig = {
  enabled: boolean
  triggerThreshold: number
  keepRecent: number
  supportedModels: string[]
}

export type CachedMCState = {
  registeredTools: Set<string>
  toolOrder: string[]
  toolGroups: string[][]
  sentToAPI: Set<string>
  deletedRefs: Set<string>
  pinnedEdits: PinnedCacheEdits[]
}

const DEFAULT_CACHED_MC_CONFIG: CachedMCConfig = {
  enabled: false,
  triggerThreshold: 8,
  keepRecent: 5,
  supportedModels: [],
}

export function getCachedMCConfig(): CachedMCConfig {
  return DEFAULT_CACHED_MC_CONFIG
}

export function isCachedMicrocompactEnabled(): boolean {
  return false
}

export function isModelSupportedForCacheEditing(_model: string): boolean {
  return false
}

export function createCachedMCState(): CachedMCState {
  return {
    registeredTools: new Set(),
    toolOrder: [],
    toolGroups: [],
    sentToAPI: new Set(),
    deletedRefs: new Set(),
    pinnedEdits: [],
  }
}

export function registerToolResult(
  state: CachedMCState,
  toolUseId: string,
): void {
  if (state.registeredTools.has(toolUseId)) {
    return
  }

  state.registeredTools.add(toolUseId)
  state.toolOrder.push(toolUseId)
}

export function registerToolMessage(
  state: CachedMCState,
  toolUseIds: string[],
): void {
  if (toolUseIds.length === 0) {
    return
  }

  state.toolGroups.push([...toolUseIds])
}

export function markToolsSentToAPI(state: CachedMCState): void {
  for (const toolUseId of state.toolOrder) {
    if (!state.deletedRefs.has(toolUseId)) {
      state.sentToAPI.add(toolUseId)
    }
  }
}

export function resetCachedMCState(state: CachedMCState): void {
  state.registeredTools.clear()
  state.toolOrder.length = 0
  state.toolGroups.length = 0
  state.sentToAPI.clear()
  state.deletedRefs.clear()
  state.pinnedEdits.length = 0
}

export function getToolResultsToDelete(_state: CachedMCState): string[] {
  return []
}

export function createCacheEditsBlock(
  state: CachedMCState,
  toolUseIds: string[],
): CacheEditsBlock | null {
  const uniqueIds = toolUseIds.filter(
    (toolUseId, index, ids) =>
      ids.indexOf(toolUseId) === index && !state.deletedRefs.has(toolUseId),
  )

  if (uniqueIds.length === 0) {
    return null
  }

  for (const toolUseId of uniqueIds) {
    state.deletedRefs.add(toolUseId)
  }

  return {
    type: 'cache_edits',
    edits: uniqueIds.map(cache_reference => ({
      type: 'delete',
      cache_reference,
    })),
  }
}
