export type ToolTier =
  | 'first_line'
  | 'second_line'
  | 'opt_in_only'
  | 'gated'

export type ToolPolicy = {
  tier: ToolTier
  rationale: string
}

// Default product-path tool policy. This is the source of truth for which
// tools are meant to be the model's first move vs higher-order or gated tools.
export const TOOL_POLICY_BY_NAME = {
  Agent: {
    tier: 'second_line',
    rationale: 'Delegation and fan-out after direct tools are insufficient.',
  },
  AskUserQuestion: {
    tier: 'second_line',
    rationale: 'Clarify only when direct progress would be risky.',
  },
  Bash: {
    tier: 'first_line',
    rationale:
      'Primary shell surface for scoped repo discovery (`find`), content search (`rg`), and SCM operations; prefer `sl` by default.',
  },
  Config: {
    tier: 'gated',
    rationale: 'Internal product configuration surface.',
  },
  CronCreate: {
    tier: 'gated',
    rationale: 'Explicit scheduler automation behind feature gating.',
  },
  CronDelete: {
    tier: 'gated',
    rationale: 'Explicit scheduler automation behind feature gating.',
  },
  CronList: {
    tier: 'gated',
    rationale: 'Explicit scheduler automation behind feature gating.',
  },
  Edit: {
    tier: 'first_line',
    rationale: 'Primary structured file editing tool.',
  },
  EnterPlanMode: {
    tier: 'second_line',
    rationale: 'Workflow control, not a first action for normal task work.',
  },
  EnterWorktree: {
    tier: 'second_line',
    rationale: 'Workspace control after initial repo inspection.',
  },
  ExitPlanMode: {
    tier: 'second_line',
    rationale: 'Workflow control, not a first action for normal task work.',
  },
  ExitWorktree: {
    tier: 'second_line',
    rationale: 'Workspace control after initial repo inspection.',
  },
  Glob: {
    tier: 'second_line',
    rationale:
      'Structured helper for glob-pattern file and directory discovery when shell output is not needed.',
  },
  Grep: {
    tier: 'second_line',
    rationale:
      'Structured ripgrep-backed helper for content search when Bash `rg` is not the clearest fit.',
  },
  js_repl: {
    tier: 'opt_in_only',
    rationale: 'General-purpose JavaScript kernel for higher-order scripting.',
  },
  js_repl_reset: {
    tier: 'opt_in_only',
    rationale: 'Kernel reset companion for js_repl.',
  },
  ListMcpResourcesTool: {
    tier: 'second_line',
    rationale: 'MCP exploration after first-line task tools.',
  },
  ListPeers: {
    tier: 'gated',
    rationale: 'Inbox/peer routing surface behind explicit feature gating.',
  },
  LSP: {
    tier: 'gated',
    rationale: 'Structured language-server operations behind explicit opt-in.',
  },
  mcp: {
    tier: 'gated',
    rationale: 'Generic MCP bridge surface, not a default first move.',
  },
  NotebookEdit: {
    tier: 'first_line',
    rationale: 'First-line editing surface for notebook files.',
  },
  PowerShell: {
    tier: 'gated',
    rationale: 'Platform-specific shell surface; only enable when supported.',
  },
  PushNotification: {
    tier: 'gated',
    rationale: 'Out-of-band notification surface behind explicit feature gating.',
  },
  py_repl: {
    tier: 'opt_in_only',
    rationale:
      'Future high-power Python kernel; must remain opt-in when it lands.',
  },
  py_repl_reset: {
    tier: 'opt_in_only',
    rationale: 'Kernel reset companion for py_repl.',
  },
  Read: {
    tier: 'first_line',
    rationale: 'First-line file reading surface.',
  },
  ReadMcpResourceTool: {
    tier: 'second_line',
    rationale: 'MCP resource access after first-line task tools.',
  },
  REPL: {
    tier: 'opt_in_only',
    rationale:
      'Transparent orchestration/TUI-specific tool, not a first-line discovery tool.',
  },
  RemoteTrigger: {
    tier: 'gated',
    rationale: 'Remote trigger automation behind explicit feature gating.',
  },
  SendMessage: {
    tier: 'second_line',
    rationale: 'Team/peer coordination after direct task progress.',
  },
  SendUserFile: {
    tier: 'gated',
    rationale: 'User file delivery behind explicit product gating.',
  },
  SendUserMessage: {
    tier: 'second_line',
    rationale: 'Primary visible user-message channel, not repo-discovery tooling.',
  },
  Skill: {
    tier: 'second_line',
    rationale: 'Use when a named skill materially helps.',
  },
  Sleep: {
    tier: 'gated',
    rationale: 'Timer/scheduler behavior behind explicit feature gating.',
  },
  Snip: {
    tier: 'gated',
    rationale: 'History-shaping surface behind explicit feature gating.',
  },
  SubscribePR: {
    tier: 'gated',
    rationale: 'External webhook subscription behind explicit feature gating.',
  },
  SuggestBackgroundPR: {
    tier: 'gated',
    rationale: 'Background PR workflow behind explicit feature gating.',
  },
  SyntheticOutput: {
    tier: 'gated',
    rationale: 'Internal synthetic output/testing surface.',
  },
  TaskCreate: {
    tier: 'second_line',
    rationale: 'Task tracking aid after first-line work is clear.',
  },
  TaskGet: {
    tier: 'second_line',
    rationale: 'Task tracking aid after first-line work is clear.',
  },
  TaskList: {
    tier: 'second_line',
    rationale: 'Task tracking aid after first-line work is clear.',
  },
  TaskOutput: {
    tier: 'second_line',
    rationale: 'Subtask output surface, not a first action.',
  },
  TaskStop: {
    tier: 'second_line',
    rationale: 'Task lifecycle control, not a first action.',
  },
  TaskUpdate: {
    tier: 'second_line',
    rationale: 'Task tracking aid after first-line work is clear.',
  },
  TeamCreate: {
    tier: 'gated',
    rationale: 'Team/swarm orchestration behind explicit feature gating.',
  },
  TeamDelete: {
    tier: 'gated',
    rationale: 'Team/swarm orchestration behind explicit feature gating.',
  },
  TestingPermission: {
    tier: 'gated',
    rationale: 'Test-only permission harness.',
  },
  TodoWrite: {
    tier: 'second_line',
    rationale: 'Planning/tracking aid, not a discovery primitive.',
  },
  ToolSearch: {
    tier: 'second_line',
    rationale: 'Use after first-line tools when looking for a specialized tool.',
  },
  Tungsten: {
    tier: 'gated',
    rationale: 'Internal Noumena-only surface.',
  },
  VerifyPlanExecution: {
    tier: 'gated',
    rationale: 'Plan verification surface behind explicit feature gating.',
  },
  WebBrowser: {
    tier: 'gated',
    rationale: 'Interactive browser automation behind explicit feature gating.',
  },
  WebFetch: {
    tier: 'first_line',
    rationale: 'First-line fetch for known URLs or documents.',
  },
  WebSearch: {
    tier: 'first_line',
    rationale: 'First-line web discovery/search when external search is needed.',
  },
  Workflow: {
    tier: 'gated',
    rationale: 'Scripted workflow surface behind explicit feature gating.',
  },
  Write: {
    tier: 'first_line',
    rationale: 'Primary file creation/replacement surface.',
  },
} as const satisfies Record<string, ToolPolicy>

export const TOOL_TIER_ORDER: Record<ToolTier, number> = {
  first_line: 0,
  second_line: 1,
  opt_in_only: 2,
  gated: 3,
}

export function getToolPolicy(toolName: string): ToolPolicy | undefined {
  return TOOL_POLICY_BY_NAME[toolName as keyof typeof TOOL_POLICY_BY_NAME]
}

export function getToolTier(toolName: string): ToolTier | undefined {
  return getToolPolicy(toolName)?.tier
}

export function getToolNamesByTier(tier: ToolTier): string[] {
  return Object.entries(TOOL_POLICY_BY_NAME)
    .filter(([, policy]) => policy.tier === tier)
    .map(([toolName]) => toolName)
    .sort((a, b) => a.localeCompare(b))
}

export function getPrimaryDirectToolNames(): string[] {
  return ['Bash', 'Read', 'Edit', 'Write', 'NotebookEdit']
}

const SECONDARY_DIRECT_TOOL_ORDER = ['Glob', 'Grep'] as const

const PRIMARY_TOOL_ORDER = [
  ...getPrimaryDirectToolNames(),
  ...SECONDARY_DIRECT_TOOL_ORDER,
  'WebFetch',
  'WebSearch',
] as const

const PRIMARY_TOOL_ORDER_INDEX = new Map(
  PRIMARY_TOOL_ORDER.map((toolName, index) => [toolName, index]),
)

export function sortToolsByPolicy<T extends { name: string }>(tools: readonly T[]): T[] {
  return [...tools]
    .map((tool, index) => ({ tool, index }))
    .sort((left, right) => {
      const leftTier = getToolTier(left.tool.name)
      const rightTier = getToolTier(right.tool.name)
      const leftTierRank = leftTier ? TOOL_TIER_ORDER[leftTier] : Number.MAX_SAFE_INTEGER
      const rightTierRank = rightTier ? TOOL_TIER_ORDER[rightTier] : Number.MAX_SAFE_INTEGER
      if (leftTierRank !== rightTierRank) {
        return leftTierRank - rightTierRank
      }

      const leftPrimaryIndex = PRIMARY_TOOL_ORDER_INDEX.get(left.tool.name)
      const rightPrimaryIndex = PRIMARY_TOOL_ORDER_INDEX.get(right.tool.name)
      if (leftPrimaryIndex !== undefined || rightPrimaryIndex !== undefined) {
        if (leftPrimaryIndex === undefined) return 1
        if (rightPrimaryIndex === undefined) return -1
        if (leftPrimaryIndex !== rightPrimaryIndex) {
          return leftPrimaryIndex - rightPrimaryIndex
        }
      }

      const byName = left.tool.name.localeCompare(right.tool.name)
      if (byName !== 0) {
        return byName
      }
      return left.index - right.index
    })
    .map(entry => entry.tool)
}
