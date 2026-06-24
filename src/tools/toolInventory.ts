import {
  getEmptyToolPermissionContext,
  type Tool,
  type ToolPermissionContext,
} from '../Tool.js'
import { getAllBaseTools, getTools } from '../tools.js'
import { getReplPrimitiveTools } from './REPLTool/primitiveTools.js'
import { isDeferredTool } from './ToolSearchTool/prompt.js'
import {
  getToolPolicy,
  sortToolsByPolicy,
  type ToolTier,
  TOOL_POLICY_BY_NAME,
} from './toolPolicy.js'

export type ToolAdvertisedSurface = 'turn_one' | 'deferred' | 'not_exposed'

export type ToolInventoryEntry = {
  name: string
  tier: ToolTier | null
  rationale: string | null
  policyDefined: boolean
  /**
   * Present in at least one built-in runtime surface in the current environment:
   * the top-level base registry or the REPL primitive surface.
   */
  compiled: boolean
  /**
   * Present in the top-level base registry before isEnabled/deny filtering.
   */
  baseRegistered: boolean
  /**
   * Present in the enabled top-level tool list for the current permission context.
   */
  enabled: boolean
  /**
   * How the tool is advertised to the model on the top-level surface right now.
   */
  turnOneOrDeferred: ToolAdvertisedSurface
  /**
   * Exposed as a nested primitive inside the orchestration REPL surface.
   */
  replExposed: boolean
  shouldDefer: boolean
  alwaysLoad: boolean
  isMcp: boolean
  aliases: string[]
  searchHint: string | null
  userFacingName: string | null
}

export type ToolInventorySummary = {
  turnOne: string[]
  deferred: string[]
  notExposed: string[]
  firstLineDeferred: string[]
  replOnly: string[]
  policyOnly: string[]
}

type ToolInventoryInputs = {
  baseTools: Tool[]
  enabledTools: Tool[]
  replPrimitiveTools: readonly Tool[]
}

function normalizeUserFacingName(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function resolveUserFacingName(tool: Tool | undefined): string | null {
  if (!tool) return null
  try {
    return normalizeUserFacingName(tool.userFacingName(undefined))
  } catch {
    return tool.name
  }
}

function sortToolNames(names: Iterable<string>): string[] {
  return sortToolsByPolicy([...new Set(names)].map(name => ({ name }))).map(
    tool => tool.name,
  )
}

export function buildToolInventory({
  baseTools,
  enabledTools,
  replPrimitiveTools,
}: ToolInventoryInputs): ToolInventoryEntry[] {
  const baseByName = new Map(baseTools.map(tool => [tool.name, tool]))
  const enabledByName = new Map(enabledTools.map(tool => [tool.name, tool]))
  const replByName = new Map(replPrimitiveTools.map(tool => [tool.name, tool]))

  const toolNames = sortToolNames([
    ...Object.keys(TOOL_POLICY_BY_NAME),
    ...baseByName.keys(),
    ...enabledByName.keys(),
    ...replByName.keys(),
  ])

  return toolNames.map(name => {
    const policy = getToolPolicy(name)
    const baseTool = baseByName.get(name)
    const enabledTool = enabledByName.get(name)
    const replTool = replByName.get(name)
    const tool = enabledTool ?? baseTool ?? replTool
    const turnOneOrDeferred: ToolAdvertisedSurface =
      enabledTool === undefined
        ? 'not_exposed'
        : isDeferredTool(enabledTool)
          ? 'deferred'
          : 'turn_one'

    return {
      name,
      tier: policy?.tier ?? null,
      rationale: policy?.rationale ?? null,
      policyDefined: policy !== undefined,
      compiled: baseTool !== undefined || replTool !== undefined,
      baseRegistered: baseTool !== undefined,
      enabled: enabledTool !== undefined,
      turnOneOrDeferred,
      replExposed: replTool !== undefined,
      shouldDefer: tool?.shouldDefer === true,
      alwaysLoad: tool?.alwaysLoad === true,
      isMcp: tool?.isMcp === true,
      aliases: tool?.aliases ?? [],
      searchHint: tool?.searchHint ?? null,
      userFacingName: resolveUserFacingName(tool),
    }
  })
}

export function collectToolInventory(
  permissionContext: ToolPermissionContext = getEmptyToolPermissionContext(),
): ToolInventoryEntry[] {
  return buildToolInventory({
    baseTools: getAllBaseTools(),
    enabledTools: getTools(permissionContext),
    replPrimitiveTools: getReplPrimitiveTools(),
  })
}

export function indexToolInventory(
  entries: readonly ToolInventoryEntry[],
): Map<string, ToolInventoryEntry> {
  return new Map(entries.map(entry => [entry.name, entry]))
}

export function summarizeToolInventory(
  entries: readonly ToolInventoryEntry[],
): ToolInventorySummary {
  return {
    turnOne: entries
      .filter(entry => entry.turnOneOrDeferred === 'turn_one')
      .map(entry => entry.name),
    deferred: entries
      .filter(entry => entry.turnOneOrDeferred === 'deferred')
      .map(entry => entry.name),
    notExposed: entries
      .filter(entry => entry.turnOneOrDeferred === 'not_exposed')
      .map(entry => entry.name),
    firstLineDeferred: entries
      .filter(
        entry =>
          entry.tier === 'first_line' && entry.turnOneOrDeferred === 'deferred',
      )
      .map(entry => entry.name),
    replOnly: entries
      .filter(entry => entry.replExposed && !entry.baseRegistered)
      .map(entry => entry.name),
    policyOnly: entries
      .filter(entry => entry.policyDefined && !entry.compiled)
      .map(entry => entry.name),
  }
}
