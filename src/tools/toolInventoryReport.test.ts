import { describe, expect, it } from 'bun:test'
import { join } from 'node:path'
import {
  buildToolInventoryReport,
  indexToolInventoryGaps,
  type ToolInventoryReport,
} from './toolInventoryReport.js'
import type { ToolInventoryEntry, ToolInventorySummary } from './toolInventory.js'

const BUN_BIN = Bun.which('bun') ?? process.execPath
const CODE_ROOT = join(import.meta.dir, '../..')

function probeReport(env: Record<string, string | undefined>): ToolInventoryReport {
  const script = [
    'process.env.NCODE_BUILD_MODE = "noumena";',
    'process.env.CLAUDE_CODE_ENTRYPOINT = "cli";',
    'delete process.env.NODE_ENV;',
    'delete process.env.EMBEDDED_SEARCH_TOOLS;',
    'delete process.env.NCODE_REPL;',
    'delete process.env.CLAUDE_CODE_REPL;',
    'delete process.env.CLAUDE_REPL_MODE;',
    'delete process.env.NCODE_JS_REPL;',
    'delete process.env.CLAUDE_CODE_JS_REPL;',
    'delete process.env.NCODE_PY_REPL;',
    'delete process.env.CLAUDE_CODE_PY_REPL;',
    'delete process.env.ENABLE_LSP_TOOL;',
    ...Object.entries(env).map(([key, value]) =>
      value === undefined
        ? `delete process.env.${key};`
        : `process.env.${key} = ${JSON.stringify(value)};`,
    ),
    'const { collectToolInventory } = await import("./src/tools/toolInventory.js");',
    'const { buildToolInventoryReport } = await import("./src/tools/toolInventoryReport.js");',
    'const entries = collectToolInventory();',
    'console.log(JSON.stringify(buildToolInventoryReport(entries)));',
  ].join('\n')

  const result = Bun.spawnSync({
    cmd: [BUN_BIN, '-e', script],
    cwd: CODE_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  })

  expect(result.exitCode).toBe(0)
  return JSON.parse(result.stdout.toString()) as ToolInventoryReport
}

const DEFAULT_INTERNAL_CLI_REPORT = probeReport({})
const SDK_CLI_REPL_REPORT = probeReport({
  CLAUDE_CODE_ENTRYPOINT: 'sdk-cli',
  NCODE_REPL: '1',
  NCODE_JS_REPL: '1',
  NCODE_PY_REPL: '1',
})
const EMBEDDED_SEARCH_CLI_REPORT = probeReport({
  EMBEDDED_SEARCH_TOOLS: '1',
})

const DEFAULT_INTERNAL_CLI_SUMMARY: ToolInventorySummary = {
  turnOne: [
    'Bash',
    'Read',
    'Edit',
    'Write',
    'Glob',
    'Grep',
    'Agent',
    'Skill',
    'ToolSearch',
    'Tungsten',
  ],
  deferred: [
    'NotebookEdit',
    'WebFetch',
    'WebSearch',
    'AskUserQuestion',
    'EnterPlanMode',
    'EnterWorktree',
    'ExitPlanMode',
    'ExitWorktree',
    'SendMessage',
    'TaskStop',
    'TodoWrite',
    'Config',
    'SuggestBackgroundPR',
    'TeamCreate',
    'TeamDelete',
  ],
  notExposed: [
    'ListMcpResourcesTool',
    'ReadMcpResourceTool',
    'SendUserMessage',
    'TaskCreate',
    'TaskGet',
    'TaskList',
    'TaskOutput',
    'TaskUpdate',
    'js_repl',
    'js_repl_reset',
    'py_repl',
    'py_repl_reset',
    'REPL',
    'CronCreate',
    'CronDelete',
    'CronList',
    'ListPeers',
    'LSP',
    'mcp',
    'PowerShell',
    'PushNotification',
    'RemoteTrigger',
    'SendUserFile',
    'Sleep',
    'Snip',
    'SubscribePR',
    'SyntheticOutput',
    'TestingPermission',
    'VerifyPlanExecution',
    'WebBrowser',
    'Workflow',
  ],
  firstLineDeferred: ['NotebookEdit', 'WebFetch', 'WebSearch'],
  replOnly: [],
  policyOnly: [
    'TaskCreate',
    'TaskGet',
    'TaskList',
    'TaskUpdate',
    'js_repl',
    'js_repl_reset',
    'py_repl',
    'py_repl_reset',
    'REPL',
    'CronCreate',
    'CronDelete',
    'CronList',
    'ListPeers',
    'LSP',
    'mcp',
    'PowerShell',
    'PushNotification',
    'RemoteTrigger',
    'SendUserFile',
    'Sleep',
    'Snip',
    'SubscribePR',
    'SyntheticOutput',
    'TestingPermission',
    'VerifyPlanExecution',
    'WebBrowser',
    'Workflow',
  ],
}

const SDK_CLI_REPL_SUMMARY: ToolInventorySummary = {
  turnOne: [
    'Bash',
    'Read',
    'Edit',
    'Write',
    'Glob',
    'Grep',
    'Agent',
    'Skill',
    'ToolSearch',
    'js_repl',
    'js_repl_reset',
    'REPL',
    'Tungsten',
  ],
  deferred: DEFAULT_INTERNAL_CLI_SUMMARY.deferred,
  notExposed: [
    'ListMcpResourcesTool',
    'ReadMcpResourceTool',
    'SendUserMessage',
    'TaskCreate',
    'TaskGet',
    'TaskList',
    'TaskOutput',
    'TaskUpdate',
    'py_repl',
    'py_repl_reset',
    'CronCreate',
    'CronDelete',
    'CronList',
    'ListPeers',
    'LSP',
    'mcp',
    'PowerShell',
    'PushNotification',
    'RemoteTrigger',
    'SendUserFile',
    'Sleep',
    'Snip',
    'SubscribePR',
    'SyntheticOutput',
    'TestingPermission',
    'VerifyPlanExecution',
    'WebBrowser',
    'Workflow',
  ],
  firstLineDeferred: DEFAULT_INTERNAL_CLI_SUMMARY.firstLineDeferred,
  replOnly: [],
  policyOnly: [
    'TaskCreate',
    'TaskGet',
    'TaskList',
    'TaskUpdate',
    'py_repl',
    'py_repl_reset',
    'CronCreate',
    'CronDelete',
    'CronList',
    'ListPeers',
    'LSP',
    'mcp',
    'PowerShell',
    'PushNotification',
    'RemoteTrigger',
    'SendUserFile',
    'Sleep',
    'Snip',
    'SubscribePR',
    'SyntheticOutput',
    'TestingPermission',
    'VerifyPlanExecution',
    'WebBrowser',
    'Workflow',
  ],
}

const EMBEDDED_SEARCH_CLI_SUMMARY: ToolInventorySummary = {
  turnOne: [
    'Bash',
    'Read',
    'Edit',
    'Write',
    'Agent',
    'Skill',
    'ToolSearch',
    'Tungsten',
  ],
  deferred: DEFAULT_INTERNAL_CLI_SUMMARY.deferred,
  notExposed: [
    'Glob',
    'Grep',
    'ListMcpResourcesTool',
    'ReadMcpResourceTool',
    'SendUserMessage',
    'TaskCreate',
    'TaskGet',
    'TaskList',
    'TaskOutput',
    'TaskUpdate',
    'js_repl',
    'js_repl_reset',
    'py_repl',
    'py_repl_reset',
    'REPL',
    'CronCreate',
    'CronDelete',
    'CronList',
    'ListPeers',
    'LSP',
    'mcp',
    'PowerShell',
    'PushNotification',
    'RemoteTrigger',
    'SendUserFile',
    'Sleep',
    'Snip',
    'SubscribePR',
    'SyntheticOutput',
    'TestingPermission',
    'VerifyPlanExecution',
    'WebBrowser',
    'Workflow',
  ],
  firstLineDeferred: DEFAULT_INTERNAL_CLI_SUMMARY.firstLineDeferred,
  replOnly: ['Glob', 'Grep'],
  policyOnly: DEFAULT_INTERNAL_CLI_SUMMARY.policyOnly,
}

describe('tool inventory report', () => {
  it('derives the full default CLI contract and gaps directly from inventory state', () => {
    const gaps = indexToolInventoryGaps(DEFAULT_INTERNAL_CLI_REPORT.gaps)

    expect(DEFAULT_INTERNAL_CLI_REPORT.summary).toEqual(DEFAULT_INTERNAL_CLI_SUMMARY)
    expect(gaps.get('first_line_deferred')?.tools).toEqual(
      DEFAULT_INTERNAL_CLI_SUMMARY.firstLineDeferred,
    )
    expect(gaps.get('gated_turn_one')?.tools).toEqual(['Tungsten'])
    expect(gaps.get('policy_only')?.tools).toEqual(
      DEFAULT_INTERNAL_CLI_SUMMARY.policyOnly,
    )
    expect(gaps.get('compiled_without_policy')).toBeUndefined()
    expect(gaps.get('enabled_without_policy')).toBeUndefined()
    expect(gaps.get('repl_only')).toBeUndefined()
    expect(gaps.get('deferred_without_search_hint')).toBeUndefined()
    expect(DEFAULT_INTERNAL_CLI_REPORT.gaps).toEqual([
      {
        kind: 'policy_only',
        tools: DEFAULT_INTERNAL_CLI_SUMMARY.policyOnly,
      },
      {
        kind: 'first_line_deferred',
        tools: DEFAULT_INTERNAL_CLI_SUMMARY.firstLineDeferred,
      },
      {
        kind: 'gated_turn_one',
        tools: ['Tungsten'],
      },
    ])
  })

  it('retains the broader contract while surfacing REPL tools in the sdk-cli opt-in profile', () => {
    const gaps = indexToolInventoryGaps(SDK_CLI_REPL_REPORT.gaps)

    expect(SDK_CLI_REPL_REPORT.summary).toEqual(SDK_CLI_REPL_SUMMARY)
    expect(gaps.get('policy_only')?.tools).toEqual(SDK_CLI_REPL_SUMMARY.policyOnly)
    expect(gaps.get('first_line_deferred')?.tools).toEqual(
      SDK_CLI_REPL_SUMMARY.firstLineDeferred,
    )
    expect(gaps.get('gated_turn_one')?.tools).toEqual(['Tungsten'])
    expect(gaps.get('repl_only')).toBeUndefined()
    expect(SDK_CLI_REPL_REPORT.gaps).toEqual([
      {
        kind: 'policy_only',
        tools: SDK_CLI_REPL_SUMMARY.policyOnly,
      },
      {
        kind: 'first_line_deferred',
        tools: SDK_CLI_REPL_SUMMARY.firstLineDeferred,
      },
      {
        kind: 'gated_turn_one',
        tools: ['Tungsten'],
      },
    ])
  })

  it('flags the embedded-search contract divergence where REPL still exposes removed helper tools', () => {
    const gaps = indexToolInventoryGaps(EMBEDDED_SEARCH_CLI_REPORT.gaps)

    expect(EMBEDDED_SEARCH_CLI_REPORT.summary).toEqual(EMBEDDED_SEARCH_CLI_SUMMARY)
    expect(gaps.get('policy_only')?.tools).toEqual(
      EMBEDDED_SEARCH_CLI_SUMMARY.policyOnly,
    )
    expect(gaps.get('first_line_deferred')?.tools).toEqual(
      EMBEDDED_SEARCH_CLI_SUMMARY.firstLineDeferred,
    )
    expect(gaps.get('gated_turn_one')?.tools).toEqual(['Tungsten'])
    expect(gaps.get('repl_only')?.tools).toEqual(
      EMBEDDED_SEARCH_CLI_SUMMARY.replOnly,
    )
    expect(EMBEDDED_SEARCH_CLI_REPORT.gaps).toEqual([
      {
        kind: 'policy_only',
        tools: EMBEDDED_SEARCH_CLI_SUMMARY.policyOnly,
      },
      {
        kind: 'first_line_deferred',
        tools: EMBEDDED_SEARCH_CLI_SUMMARY.firstLineDeferred,
      },
      {
        kind: 'gated_turn_one',
        tools: ['Tungsten'],
      },
      {
        kind: 'repl_only',
        tools: EMBEDDED_SEARCH_CLI_SUMMARY.replOnly,
      },
    ])
  })

  it('can rebuild the same report object from an already-collected inventory', () => {
    const rebuilt = buildToolInventoryReport(
      DEFAULT_INTERNAL_CLI_REPORT.entries as ToolInventoryEntry[],
    )

    expect(rebuilt.summary).toEqual(DEFAULT_INTERNAL_CLI_REPORT.summary)
    expect(rebuilt.gaps).toEqual(DEFAULT_INTERNAL_CLI_REPORT.gaps)
  })
})
