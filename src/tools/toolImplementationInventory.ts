import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { getToolPolicy, TOOL_TIER_ORDER, type ToolTier } from './toolPolicy.js'

export type ToolImplementationProfileId =
  | 'default_internal_cli'
  | 'sdk_cli_repl'
  | 'embedded_search_cli'
  | 'tasks_enabled_cli'
  | 'lsp_enabled_cli'
  | 'verify_plan_cli'
  | 'test_node_env_cli'
  | 'structured_output_noninteractive'

export type ToolImplementationProfile = {
  id: ToolImplementationProfileId
  description: string
  env: Record<string, string | undefined>
}

export type ToolImplementationEntry = {
  name: string
  tier: ToolTier | null
  policyNames: string[]
  aliases: string[]
  sourceFamily: string
  sourcePath: string
  implementedOnDisk: boolean
  dynamicPattern: string | null
  reachableProfiles: ToolImplementationProfileId[]
  reachableInCurrentBuild: boolean
  notes: string | null
}

type ToolImplementationSeed = {
  name: string
  policyNames?: string[]
  aliases?: string[]
  dynamicPattern?: string | null
  notes?: string | null
}

type ToolImplementationFamilyOverride = {
  entries: ToolImplementationSeed[]
  sourcePath?: string
}

const CODE_ROOT = join(import.meta.dir, '..', '..')
const SRC_TOOLS_ROOT = join(CODE_ROOT, 'src/tools')
const BUN_BIN = Bun.which('bun') ?? process.execPath
const PROBE_ENV_KEYS = [
  'NCODE_BUILD_MODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'EMBEDDED_SEARCH_TOOLS',
  'NCODE_REPL',
  'CLAUDE_CODE_REPL',
  'CLAUDE_REPL_MODE',
  'NCODE_JS_REPL',
  'CLAUDE_CODE_JS_REPL',
  'NCODE_PY_REPL',
  'CLAUDE_CODE_PY_REPL',
  'ENABLE_LSP_TOOL',
  'CLAUDE_CODE_ENABLE_TASKS',
  'CLAUDE_CODE_VERIFY_PLAN',
  'NODE_ENV',
] as const

export const TOOL_IMPLEMENTATION_PROFILES: readonly ToolImplementationProfile[] =
  [
    {
      id: 'default_internal_cli',
      description: 'Default internal CLI runtime surface.',
      env: {
        NCODE_BUILD_MODE: 'noumena',
        CLAUDE_CODE_ENTRYPOINT: 'cli',
      },
    },
    {
      id: 'sdk_cli_repl',
      description: 'sdk-cli with REPL/js_repl/py_repl opt-ins enabled.',
      env: {
        NCODE_BUILD_MODE: 'noumena',
        CLAUDE_CODE_ENTRYPOINT: 'sdk-cli',
        NCODE_REPL: '1',
        NCODE_JS_REPL: '1',
        NCODE_PY_REPL: '1',
      },
    },
    {
      id: 'embedded_search_cli',
      description: 'Internal CLI with embedded bfs/ugrep search enabled.',
      env: {
        NCODE_BUILD_MODE: 'noumena',
        CLAUDE_CODE_ENTRYPOINT: 'cli',
        EMBEDDED_SEARCH_TOOLS: '1',
      },
    },
    {
      id: 'tasks_enabled_cli',
      description: 'Internal CLI with TaskCreate/Get/List/Update enabled.',
      env: {
        NCODE_BUILD_MODE: 'noumena',
        CLAUDE_CODE_ENTRYPOINT: 'cli',
        CLAUDE_CODE_ENABLE_TASKS: '1',
      },
    },
    {
      id: 'lsp_enabled_cli',
      description: 'Internal CLI with the LSP tool enabled.',
      env: {
        NCODE_BUILD_MODE: 'noumena',
        CLAUDE_CODE_ENTRYPOINT: 'cli',
        ENABLE_LSP_TOOL: '1',
      },
    },
    {
      id: 'verify_plan_cli',
      description: 'Internal CLI with VerifyPlanExecution enabled.',
      env: {
        NCODE_BUILD_MODE: 'noumena',
        CLAUDE_CODE_ENTRYPOINT: 'cli',
        CLAUDE_CODE_VERIFY_PLAN: 'true',
      },
    },
    {
      id: 'test_node_env_cli',
      description: 'Internal CLI test profile that exposes TestingPermission.',
      env: {
        NCODE_BUILD_MODE: 'noumena',
        CLAUDE_CODE_ENTRYPOINT: 'cli',
        NODE_ENV: 'test',
      },
    },
  ] as const

const FAMILY_OVERRIDES: Record<string, ToolImplementationFamilyOverride> = {
  BriefTool: {
    entries: [
      {
        name: 'SendUserMessage',
        aliases: ['Brief'],
      },
    ],
  },
  FileEditTool: {
    entries: [{ name: 'Edit' }],
  },
  FileReadTool: {
    entries: [{ name: 'Read' }],
  },
  FileWriteTool: {
    entries: [{ name: 'Write' }],
  },
  ListMcpResourcesTool: {
    entries: [{ name: 'ListMcpResourcesTool' }],
  },
  MCPTool: {
    entries: [{ name: 'mcp' }],
  },
  McpAuthTool: {
    entries: [
      {
        name: 'mcp__<server>__authenticate',
        dynamicPattern: 'mcp__<server>__authenticate',
        notes:
          'Dynamic pseudo-tool family created for unauthenticated MCP servers.',
      },
    ],
  },
  REPLTool: {
    entries: [
      { name: 'REPL' },
      { name: 'js_repl' },
      { name: 'js_repl_reset' },
      { name: 'py_repl' },
      { name: 'py_repl_reset' },
    ],
  },
  ScheduleCronTool: {
    entries: [
      { name: 'CronCreate' },
      { name: 'CronDelete' },
      { name: 'CronList' },
    ],
  },
  SyntheticOutputTool: {
    entries: [
      {
        name: 'StructuredOutput',
        policyNames: ['SyntheticOutput'],
        notes:
          'Special noninteractive structured-output tool synthesized when JSON schema output is requested.',
      },
    ],
  },
  ReadMcpResourceTool: {
    entries: [{ name: 'ReadMcpResourceTool' }],
  },
  TestingPermissionTool: {
    sourcePath: 'src/tools/testing/TestingPermissionTool.tsx',
    entries: [{ name: 'TestingPermission' }],
  },
}

let cachedReachabilityByProfile:
  | Map<ToolImplementationProfileId, Set<string>>
  | null = null
let cachedInventory: ToolImplementationEntry[] | null = null

function deriveDefaultToolName(sourceFamily: string): string {
  return sourceFamily.replace(/Tool$/, '')
}

function getSourceFamilies(): Array<{ sourceFamily: string; sourcePath: string }> {
  const families = readdirSync(SRC_TOOLS_ROOT)
    .filter(sourceFamily => {
      if (sourceFamily === 'shared' || sourceFamily === 'testing') return false
      return statSync(join(SRC_TOOLS_ROOT, sourceFamily)).isDirectory()
    })
    .sort()
    .map(sourceFamily => ({
      sourceFamily,
      sourcePath: `src/tools/${sourceFamily}`,
    }))

  families.push({
    sourceFamily: 'TestingPermissionTool',
    sourcePath: 'src/tools/testing/TestingPermissionTool.tsx',
  })

  return families
}

function getSeedsForFamily(sourceFamily: string): ToolImplementationSeed[] {
  const override = FAMILY_OVERRIDES[sourceFamily]
  if (override) return override.entries
  return [{ name: deriveDefaultToolName(sourceFamily) }]
}

function getSourcePathForFamily(
  sourceFamily: string,
  defaultSourcePath: string,
): string {
  return FAMILY_OVERRIDES[sourceFamily]?.sourcePath ?? defaultSourcePath
}

function getReachableProfilesByName(): Map<string, ToolImplementationProfileId[]> {
  if (cachedReachabilityByProfile === null) {
    cachedReachabilityByProfile = new Map(
      TOOL_IMPLEMENTATION_PROFILES.map(profile => [
        profile.id,
        probeProfileBaseTools(profile),
      ]),
    )
  }

  const byName = new Map<string, ToolImplementationProfileId[]>()
  for (const [profileId, tools] of cachedReachabilityByProfile) {
    for (const toolName of tools) {
      const reachableProfiles = byName.get(toolName) ?? []
      reachableProfiles.push(profileId)
      byName.set(toolName, reachableProfiles)
    }
  }

  // StructuredOutput is a special noninteractive tool and is exercised by the
  // smoke harness whenever a JSON schema is provided.
  byName.set('StructuredOutput', ['structured_output_noninteractive'])

  return byName
}

function probeProfileBaseTools(profile: ToolImplementationProfile): Set<string> {
  const script = [
    'delete process.env.NODE_ENV;',
    ...PROBE_ENV_KEYS.map(key =>
      profile.env[key] === undefined
        ? `delete process.env.${key};`
        : `process.env.${key} = ${JSON.stringify(profile.env[key])};`,
    ),
    'const { getAllBaseTools } = await import("./src/tools.js");',
    'console.log(JSON.stringify(getAllBaseTools().map(tool => tool.name).sort()));',
  ].join('\n')

  const result = Bun.spawnSync({
    cmd: [BUN_BIN, '-e', script],
    cwd: CODE_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  })

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to probe tool profile ${profile.id}.\nSTDOUT:\n${result.stdout.toString()}\nSTDERR:\n${result.stderr.toString()}`,
    )
  }

  return new Set(JSON.parse(result.stdout.toString()) as string[])
}

function compareEntries(
  left: ToolImplementationEntry,
  right: ToolImplementationEntry,
): number {
  const leftSortName = left.policyNames[0] ?? left.name
  const rightSortName = right.policyNames[0] ?? right.name
  const leftTier = getToolPolicy(leftSortName)?.tier
  const rightTier = getToolPolicy(rightSortName)?.tier
  const leftOrder = leftTier ? TOOL_TIER_ORDER[leftTier] : Number.MAX_SAFE_INTEGER
  const rightOrder = rightTier
    ? TOOL_TIER_ORDER[rightTier]
    : Number.MAX_SAFE_INTEGER
  if (leftOrder !== rightOrder) return leftOrder - rightOrder
  const byPolicy = leftSortName.localeCompare(rightSortName)
  if (byPolicy !== 0) return byPolicy
  return left.name.localeCompare(right.name)
}

export function collectToolImplementationInventory(): ToolImplementationEntry[] {
  if (cachedInventory) {
    return cachedInventory.map(entry => ({
      ...entry,
      policyNames: [...entry.policyNames],
      aliases: [...entry.aliases],
      reachableProfiles: [...entry.reachableProfiles],
    }))
  }

  const reachableProfilesByName = getReachableProfilesByName()

  cachedInventory = getSourceFamilies()
    .flatMap(({ sourceFamily, sourcePath }) => {
      const effectiveSourcePath = getSourcePathForFamily(sourceFamily, sourcePath)
      return getSeedsForFamily(sourceFamily).map(seed => {
        const policyNames =
          seed.policyNames ?? (seed.dynamicPattern ? [] : [seed.name])
        const reachableProfiles = reachableProfilesByName.get(seed.name) ?? []

        return {
          name: seed.name,
          tier: (policyNames[0] && getToolPolicy(policyNames[0])?.tier) ?? null,
          policyNames,
          aliases: seed.aliases ?? [],
          sourceFamily,
          sourcePath: effectiveSourcePath,
          implementedOnDisk: true,
          dynamicPattern: seed.dynamicPattern ?? null,
          reachableProfiles,
          reachableInCurrentBuild: reachableProfiles.length > 0,
          notes: seed.notes ?? null,
        } satisfies ToolImplementationEntry
      })
    })
    .sort(compareEntries)

  return cachedInventory.map(entry => ({
    ...entry,
    policyNames: [...entry.policyNames],
    aliases: [...entry.aliases],
    reachableProfiles: [...entry.reachableProfiles],
  }))
}

export function indexToolImplementationInventory(
  entries: readonly ToolImplementationEntry[],
): Map<string, ToolImplementationEntry> {
  return new Map(entries.map(entry => [entry.name, entry]))
}
