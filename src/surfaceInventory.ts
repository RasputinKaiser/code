import { ALLOWED_IDE_TOOLS } from './services/mcp/ideTools.js'
import type { ToolTier } from './tools/toolPolicy.js'
import { getToolPolicy } from './tools/toolPolicy.js'

type ToolLike = {
  name: string
  aliases?: string[]
}

type CommandLike = {
  name: string
  aliases?: string[]
  disableModelInvocation?: boolean
  userInvocable?: boolean
  loadedFrom?: string
  kind?: string
}

export type ModelToolSurfaceKind =
  | 'built_in_tool'
  | 'dynamic_tool_family'
  | 'synthetic_tool'

export type ModelToolSurfaceEntry = {
  name: string
  aliases: string[]
  kind: ModelToolSurfaceKind
  source: 'built_in' | 'dynamic'
  policyTier: ToolTier | null
  internalBuildOnly: boolean
  notes: string | null
}

export type CommandSurfaceEntry = {
  name: string
  aliases: string[]
  internalOnly: boolean
  modelCallable: boolean
  userCallable: boolean
  source: string | null
  kind: string | null
}

export type CapabilityCrosswalkEntry = {
  capability: string
  humanCommands: string[]
  modelTools: string[]
  notes: string
}

const INTERNAL_ONLY_MODEL_TOOL_NAMES = new Set([
  'Config',
  'Tungsten',
  'SuggestBackgroundPR',
  'REPL',
  'js_repl',
  'js_repl_reset',
  'py_repl',
  'py_repl_reset',
  'VerifyPlanExecution',
])

const CAPABILITY_CROSSWALK: readonly CapabilityCrosswalkEntry[] = [
  {
    capability: 'config',
    humanCommands: ['config'],
    modelTools: ['Config'],
    notes: 'Settings and configuration surface.',
  },
  {
    capability: 'workflow_orchestration',
    humanCommands: ['workflows'],
    modelTools: ['Workflow'],
    notes: 'Human workflow command paired with model workflow tool.',
  },
  {
    capability: 'github_pr_subscription',
    humanCommands: ['subscribe-pr'],
    modelTools: ['SubscribePR'],
    notes: 'Human PR subscription command paired with webhook-backed model tool.',
  },
  {
    capability: 'task_management',
    humanCommands: ['tasks'],
    modelTools: [
      'TaskCreate',
      'TaskGet',
      'TaskList',
      'TaskUpdate',
      'TaskStop',
      'TaskOutput',
      'TodoWrite',
    ],
    notes: 'Human task UI paired with model task lifecycle and planning tools.',
  },
  {
    capability: 'mcp_management',
    humanCommands: ['mcp'],
    modelTools: [
      'mcp',
      'ListMcpResourcesTool',
      'ReadMcpResourceTool',
      'mcp__<server>__authenticate',
    ],
    notes:
      'Human MCP management command paired with model MCP bridge and auth surfaces.',
  },
  {
    capability: 'ide_bridge',
    humanCommands: ['ide'],
    modelTools: [...ALLOWED_IDE_TOOLS],
    notes: 'Human IDE session command paired with model IDE MCP tools.',
  },
  {
    capability: 'planning',
    humanCommands: ['plan'],
    modelTools: [
      'EnterPlanMode',
      'ExitPlanMode',
      'VerifyPlanExecution',
      'TodoWrite',
    ],
    notes: 'Human plan command paired with model planning and verification tools.',
  },
] as const

function sortByName<T extends { name: string }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => a.name.localeCompare(b.name))
}

function toModelToolSurfaceEntry(tool: ToolLike): ModelToolSurfaceEntry {
  return {
    name: tool.name,
    aliases: [...(tool.aliases ?? [])],
    kind: 'built_in_tool',
    source: 'built_in',
    policyTier: getToolPolicy(tool.name)?.tier ?? null,
    internalBuildOnly: INTERNAL_ONLY_MODEL_TOOL_NAMES.has(tool.name),
    notes: null,
  }
}

export function buildModelToolSurfaceInventory(
  tools: readonly ToolLike[],
  syntheticOutputToolName: string,
): ModelToolSurfaceEntry[] {
  const entries = new Map<string, ModelToolSurfaceEntry>()

  for (const tool of tools) {
    entries.set(tool.name, toModelToolSurfaceEntry(tool))
  }

  entries.set(syntheticOutputToolName, {
    name: syntheticOutputToolName,
    aliases: [],
    kind: 'synthetic_tool',
    source: 'dynamic',
    policyTier: getToolPolicy('SyntheticOutput')?.tier ?? null,
    internalBuildOnly: false,
    notes:
      'Structured-output pseudo-tool synthesized when noninteractive JSON output is requested.',
  })

  entries.set('mcp__<server>__authenticate', {
    name: 'mcp__<server>__authenticate',
    aliases: [],
    kind: 'dynamic_tool_family',
    source: 'dynamic',
    policyTier: null,
    internalBuildOnly: false,
    notes: 'Dynamic MCP auth pseudo-tool family.',
  })

  for (const name of ALLOWED_IDE_TOOLS) {
    if (!entries.has(name)) {
      entries.set(name, {
        name,
        aliases: [],
        kind: 'dynamic_tool_family',
        source: 'dynamic',
        policyTier: null,
        internalBuildOnly: false,
        notes: 'Dynamic IDE MCP tool allowlisted by the NCode MCP client.',
      })
    }
  }

  return sortByName([...entries.values()])
}

export function buildCommandSurfaceInventory(
  commands: readonly CommandLike[],
  internalOnlyCommands: readonly CommandLike[],
): CommandSurfaceEntry[] {
  const internalOnlyNames = new Set(
    internalOnlyCommands.flatMap(command => [
      command.name,
      ...(command.aliases ?? []),
    ]),
  )

  return sortByName(
    commands.map(command => ({
      name: command.name,
      aliases: [...(command.aliases ?? [])],
      internalOnly: internalOnlyNames.has(command.name),
      modelCallable: command.disableModelInvocation !== true,
      userCallable: command.userInvocable !== false,
      source: command.loadedFrom ?? 'commands_DEPRECATED',
      kind: command.kind ?? null,
    })),
  )
}

export function collectSurfaceCapabilityCrosswalk(): CapabilityCrosswalkEntry[] {
  return [...CAPABILITY_CROSSWALK]
}

export async function collectModelToolSurfaceInventory(): Promise<
  ModelToolSurfaceEntry[]
> {
  const [{ getAllBaseTools }, { SYNTHETIC_OUTPUT_TOOL_NAME }] = await Promise.all([
    import('./tools.js'),
    import('./tools/SyntheticOutputTool/SyntheticOutputTool.js'),
  ])
  return buildModelToolSurfaceInventory(getAllBaseTools(), SYNTHETIC_OUTPUT_TOOL_NAME)
}

export async function collectCommandSurfaceInventory(): Promise<
  CommandSurfaceEntry[]
> {
  const { getBuiltInCommandsForDiagnostics, INTERNAL_ONLY_COMMANDS } =
    await import('./commands.js')
  return buildCommandSurfaceInventory(
    getBuiltInCommandsForDiagnostics(),
    INTERNAL_ONLY_COMMANDS,
  )
}
