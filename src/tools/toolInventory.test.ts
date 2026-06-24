import { describe, expect, it } from 'bun:test'
import { join } from 'node:path'
import {
  indexToolInventory,
  summarizeToolInventory,
  type ToolInventoryEntry,
  type ToolInventorySummary,
} from './toolInventory.js'

const BUN_BIN = Bun.which('bun') ?? process.execPath
const CODE_ROOT = join(import.meta.dir, '../..')

function probeInventory(env: Record<string, string | undefined>): ToolInventoryEntry[] {
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
    'console.log(JSON.stringify(collectToolInventory()));',
  ].join('\n')

  const result = Bun.spawnSync({
    cmd: [BUN_BIN, '-e', script],
    cwd: CODE_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  })

  expect(result.exitCode).toBe(0)
  return JSON.parse(result.stdout.toString()) as ToolInventoryEntry[]
}

const DEFAULT_INTERNAL_CLI_INVENTORY = probeInventory({})
const SDK_CLI_REPL_INVENTORY = probeInventory({
  CLAUDE_CODE_ENTRYPOINT: 'sdk-cli',
  NCODE_REPL: '1',
  NCODE_JS_REPL: '1',
  NCODE_PY_REPL: '1',
})
const EMBEDDED_SEARCH_CLI_INVENTORY = probeInventory({
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

describe('tool inventory', () => {
  it('tracks the full default internal CLI surface from one canonical model', () => {
    const entries = DEFAULT_INTERNAL_CLI_INVENTORY
    const byName = indexToolInventory(entries)
    const summary = summarizeToolInventory(entries)

    expect(summary).toEqual(DEFAULT_INTERNAL_CLI_SUMMARY)
    expect(byName.get('Bash')).toMatchObject({
      tier: 'first_line',
      compiled: true,
      baseRegistered: true,
      enabled: true,
      turnOneOrDeferred: 'turn_one',
      replExposed: true,
    })
    expect(byName.get('WebFetch')).toMatchObject({
      tier: 'first_line',
      compiled: true,
      baseRegistered: true,
      enabled: true,
      turnOneOrDeferred: 'deferred',
      replExposed: false,
    })
    expect(byName.get('WebSearch')).toMatchObject({
      tier: 'first_line',
      compiled: true,
      baseRegistered: true,
      enabled: true,
      turnOneOrDeferred: 'deferred',
      replExposed: false,
    })
    expect(byName.get('NotebookEdit')).toMatchObject({
      tier: 'first_line',
      compiled: true,
      baseRegistered: true,
      enabled: true,
      turnOneOrDeferred: 'deferred',
      replExposed: true,
    })
    expect(byName.get('SendMessage')).toMatchObject({
      tier: 'second_line',
      compiled: true,
      baseRegistered: true,
      enabled: true,
      turnOneOrDeferred: 'deferred',
      shouldDefer: true,
    })
    expect(byName.get('TaskStop')).toMatchObject({
      tier: 'second_line',
      compiled: true,
      baseRegistered: true,
      enabled: true,
      turnOneOrDeferred: 'deferred',
      shouldDefer: true,
    })
    expect(byName.get('Config')).toMatchObject({
      tier: 'gated',
      compiled: true,
      baseRegistered: true,
      enabled: true,
      turnOneOrDeferred: 'deferred',
      shouldDefer: true,
    })
    expect(byName.get('SuggestBackgroundPR')).toMatchObject({
      tier: 'gated',
      compiled: true,
      baseRegistered: true,
      enabled: true,
      turnOneOrDeferred: 'deferred',
      shouldDefer: true,
    })
    expect(byName.get('TeamCreate')).toMatchObject({
      tier: 'gated',
      compiled: true,
      baseRegistered: true,
      enabled: true,
      turnOneOrDeferred: 'deferred',
      shouldDefer: true,
    })
    expect(byName.get('TeamDelete')).toMatchObject({
      tier: 'gated',
      compiled: true,
      baseRegistered: true,
      enabled: true,
      turnOneOrDeferred: 'deferred',
      shouldDefer: true,
    })
    expect(byName.get('TaskOutput')).toMatchObject({
      tier: 'second_line',
      compiled: true,
      baseRegistered: true,
      enabled: false,
      turnOneOrDeferred: 'not_exposed',
    })
    expect(byName.get('Tungsten')).toMatchObject({
      tier: 'gated',
      compiled: true,
      baseRegistered: true,
      enabled: true,
      turnOneOrDeferred: 'turn_one',
    })
    expect(byName.get('REPL')).toMatchObject({
      tier: 'opt_in_only',
      compiled: false,
      enabled: false,
      turnOneOrDeferred: 'not_exposed',
      replExposed: false,
    })
  })

  it('shows the full sdk-cli opt-in surface when REPL tools are enabled', () => {
    const entries = SDK_CLI_REPL_INVENTORY
    const byName = indexToolInventory(entries)
    const summary = summarizeToolInventory(entries)

    expect(summary).toEqual(SDK_CLI_REPL_SUMMARY)
    expect(byName.get('REPL')).toMatchObject({
      compiled: true,
      baseRegistered: true,
      enabled: true,
      turnOneOrDeferred: 'turn_one',
    })
    expect(byName.get('js_repl')).toMatchObject({
      compiled: true,
      baseRegistered: true,
      enabled: true,
      turnOneOrDeferred: 'turn_one',
    })
    expect(byName.get('py_repl')).toMatchObject({
      compiled: false,
      baseRegistered: false,
      enabled: false,
      turnOneOrDeferred: 'not_exposed',
    })
    expect(byName.get('js_repl_reset')).toMatchObject({
      compiled: true,
      baseRegistered: true,
      enabled: true,
      turnOneOrDeferred: 'turn_one',
    })
    expect(byName.get('py_repl_reset')).toMatchObject({
      compiled: false,
      baseRegistered: false,
      enabled: false,
      turnOneOrDeferred: 'not_exposed',
    })
  })

  it('captures the full embedded-search divergence between the top-level surface and REPL primitives', () => {
    const entries = EMBEDDED_SEARCH_CLI_INVENTORY
    const byName = indexToolInventory(entries)
    const summary = summarizeToolInventory(entries)

    expect(summary).toEqual(EMBEDDED_SEARCH_CLI_SUMMARY)
    expect(byName.get('Glob')).toMatchObject({
      compiled: true,
      baseRegistered: false,
      enabled: false,
      turnOneOrDeferred: 'not_exposed',
      replExposed: true,
    })
    expect(byName.get('Grep')).toMatchObject({
      compiled: true,
      baseRegistered: false,
      enabled: false,
      turnOneOrDeferred: 'not_exposed',
      replExposed: true,
    })
  })

  it('surfaces policy-only tools that are not present in the current runtime profile', () => {
    const entries = DEFAULT_INTERNAL_CLI_INVENTORY
    const byName = indexToolInventory(entries)
    const summary = summarizeToolInventory(entries)

    expect(byName.get('Workflow')).toMatchObject({
      policyDefined: true,
      compiled: false,
      enabled: false,
      turnOneOrDeferred: 'not_exposed',
    })
    expect(byName.get('PowerShell')).toMatchObject({
      policyDefined: true,
      compiled: false,
      enabled: false,
      turnOneOrDeferred: 'not_exposed',
    })
    expect(summary.policyOnly).toContain('Workflow')
    expect(summary.policyOnly).toContain('PowerShell')
  })
})
