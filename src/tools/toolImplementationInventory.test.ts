import { describe, expect, it } from 'bun:test'
import {
  collectToolImplementationInventory,
  indexToolImplementationInventory,
} from './toolImplementationInventory.js'

const IMPLEMENTATION_INVENTORY = collectToolImplementationInventory()
const IMPLEMENTATION_BY_NAME = indexToolImplementationInventory(
  IMPLEMENTATION_INVENTORY,
)

describe('toolImplementationInventory', () => {
  it('covers the on-disk tool surface including special implementation-only tools', () => {
    expect(IMPLEMENTATION_INVENTORY.length).toBe(56)
    expect(IMPLEMENTATION_BY_NAME.has('StructuredOutput')).toBe(true)
    expect(IMPLEMENTATION_BY_NAME.has('mcp__<server>__authenticate')).toBe(true)
    expect(IMPLEMENTATION_BY_NAME.has('WebBrowser')).toBe(false)
  })

  it('records policy aliases and source families for implementation-only surfaces', () => {
    expect(IMPLEMENTATION_BY_NAME.get('StructuredOutput')).toMatchObject({
      policyNames: ['SyntheticOutput'],
      sourceFamily: 'SyntheticOutputTool',
      reachableProfiles: ['structured_output_noninteractive'],
      reachableInCurrentBuild: true,
    })

    expect(IMPLEMENTATION_BY_NAME.get('mcp__<server>__authenticate')).toMatchObject(
      {
        policyNames: [],
        sourceFamily: 'McpAuthTool',
        dynamicPattern: 'mcp__<server>__authenticate',
        reachableProfiles: [],
        reachableInCurrentBuild: false,
      },
    )
  })

  it('captures profile reachability for opt-in and gated tools', () => {
    expect(IMPLEMENTATION_BY_NAME.get('TaskCreate')).toMatchObject({
      sourceFamily: 'TaskCreateTool',
      reachableProfiles: ['tasks_enabled_cli'],
      reachableInCurrentBuild: true,
    })
    expect(IMPLEMENTATION_BY_NAME.get('LSP')).toMatchObject({
      sourceFamily: 'LSPTool',
      reachableProfiles: ['lsp_enabled_cli'],
      reachableInCurrentBuild: true,
    })
    expect(IMPLEMENTATION_BY_NAME.get('VerifyPlanExecution')).toMatchObject({
      sourceFamily: 'VerifyPlanExecutionTool',
      reachableProfiles: ['verify_plan_cli'],
      reachableInCurrentBuild: true,
    })
    expect(IMPLEMENTATION_BY_NAME.get('TestingPermission')).toMatchObject({
      sourceFamily: 'TestingPermissionTool',
      reachableProfiles: ['test_node_env_cli'],
      reachableInCurrentBuild: true,
    })
    expect(IMPLEMENTATION_BY_NAME.get('js_repl')).toMatchObject({
      sourceFamily: 'REPLTool',
      reachableProfiles: ['sdk_cli_repl'],
      reachableInCurrentBuild: true,
    })
    expect(IMPLEMENTATION_BY_NAME.get('REPL')).toMatchObject({
      sourceFamily: 'REPLTool',
      reachableProfiles: ['sdk_cli_repl'],
      reachableInCurrentBuild: true,
    })
  })

  it('keeps current-build gaps explicit for source-only tools', () => {
    expect(IMPLEMENTATION_BY_NAME.get('PowerShell')).toMatchObject({
      sourceFamily: 'PowerShellTool',
      reachableProfiles: [],
      reachableInCurrentBuild: false,
    })
    expect(IMPLEMENTATION_BY_NAME.get('RemoteTrigger')).toMatchObject({
      sourceFamily: 'RemoteTriggerTool',
      reachableProfiles: [],
      reachableInCurrentBuild: false,
    })
    expect(IMPLEMENTATION_BY_NAME.get('Workflow')).toMatchObject({
      sourceFamily: 'WorkflowTool',
      reachableProfiles: [],
      reachableInCurrentBuild: false,
    })
  })
})
