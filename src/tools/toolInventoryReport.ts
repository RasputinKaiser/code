import { getEmptyToolPermissionContext, type ToolPermissionContext } from '../Tool.js'
import {
  collectToolInventory,
  summarizeToolInventory,
  type ToolInventoryEntry,
  type ToolInventorySummary,
} from './toolInventory.js'
import { sortToolsByPolicy } from './toolPolicy.js'

export type ToolInventoryGapKind =
  | 'policy_only'
  | 'compiled_without_policy'
  | 'enabled_without_policy'
  | 'first_line_deferred'
  | 'first_line_not_enabled'
  | 'gated_turn_one'
  | 'repl_only'
  | 'deferred_without_search_hint'

export type ToolInventoryGap = {
  kind: ToolInventoryGapKind
  tools: string[]
}

export type ToolInventoryReport = {
  entries: ToolInventoryEntry[]
  summary: ToolInventorySummary
  gaps: ToolInventoryGap[]
}

function sortToolNames(names: Iterable<string>): string[] {
  return sortToolsByPolicy([...new Set(names)].map(name => ({ name }))).map(
    tool => tool.name,
  )
}

function collectGap(
  entries: readonly ToolInventoryEntry[],
  kind: ToolInventoryGapKind,
  predicate: (entry: ToolInventoryEntry) => boolean,
): ToolInventoryGap | null {
  const tools = sortToolNames(
    entries.filter(predicate).map(entry => entry.name),
  )
  return tools.length > 0 ? { kind, tools } : null
}

export function collectToolInventoryGaps(
  entries: readonly ToolInventoryEntry[],
): ToolInventoryGap[] {
  return [
    collectGap(
      entries,
      'policy_only',
      entry => entry.policyDefined && !entry.compiled,
    ),
    collectGap(
      entries,
      'compiled_without_policy',
      entry => entry.compiled && !entry.policyDefined,
    ),
    collectGap(
      entries,
      'enabled_without_policy',
      entry => entry.enabled && !entry.policyDefined,
    ),
    collectGap(
      entries,
      'first_line_deferred',
      entry =>
        entry.tier === 'first_line' && entry.turnOneOrDeferred === 'deferred',
    ),
    collectGap(
      entries,
      'first_line_not_enabled',
      entry => entry.tier === 'first_line' && !entry.enabled,
    ),
    collectGap(
      entries,
      'gated_turn_one',
      entry => entry.tier === 'gated' && entry.turnOneOrDeferred === 'turn_one',
    ),
    collectGap(
      entries,
      'repl_only',
      entry => entry.replExposed && !entry.baseRegistered,
    ),
    collectGap(
      entries,
      'deferred_without_search_hint',
      entry =>
        entry.turnOneOrDeferred === 'deferred' &&
        entry.searchHint === null &&
        entry.isMcp !== true,
    ),
  ].filter((gap): gap is ToolInventoryGap => gap !== null)
}

export function indexToolInventoryGaps(
  gaps: readonly ToolInventoryGap[],
): Map<ToolInventoryGapKind, ToolInventoryGap> {
  return new Map(gaps.map(gap => [gap.kind, gap]))
}

export function buildToolInventoryReport(
  entries: readonly ToolInventoryEntry[],
): ToolInventoryReport {
  return {
    entries: [...entries],
    summary: summarizeToolInventory(entries),
    gaps: collectToolInventoryGaps(entries),
  }
}

export function collectCurrentToolInventoryReport(
  permissionContext: ToolPermissionContext = getEmptyToolPermissionContext(),
): ToolInventoryReport {
  return buildToolInventoryReport(collectToolInventory(permissionContext))
}
