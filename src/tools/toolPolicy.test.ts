import { describe, expect, it, mock } from 'bun:test'

process.env.NOUMENA_API_KEY ??= 'test-key-for-hermetic-contracts'

const actualModel = await import(import.meta.resolve('../utils/model/model.ts'))

mock.module(import.meta.resolve('../utils/model/model.js'), () => ({
  ...actualModel,
  getMainLoopModel: () => 'claude-sonnet-4-6',
  getDefaultMainLoopModelSetting: () => 'sonnet',
  isOpus1mMergeEnabled: () => false,
  getSmallFastModel: () => 'claude-haiku-4-5',
}))

import { getEmptyToolPermissionContext } from '../Tool.js'
import {
  getPrimaryDirectToolNames,
  getToolNamesByTier,
  getToolPolicy,
  getToolTier,
  sortToolsByPolicy,
} from './toolPolicy.js'

describe('tool policy', () => {
  it('covers the current default base tool surface', async () => {
    const { getAllBaseTools } = await import('../tools.js')
    for (const tool of getAllBaseTools()) {
      expect(getToolPolicy(tool.name)).toBeDefined()
    }
  })

  it('keeps direct repo work in the first-line tier', () => {
    expect(getPrimaryDirectToolNames()).toEqual([
      'Bash',
      'Read',
      'Edit',
      'Write',
      'NotebookEdit',
    ])
    for (const toolName of getPrimaryDirectToolNames()) {
      expect(getToolTier(toolName)).toBe('first_line')
    }
  })

  it('orders the live built-in tool surface by tier so first-line tools lead', async () => {
    const { getTools } = await import('../tools.js')
    const toolNames = getTools(getEmptyToolPermissionContext()).map(tool => tool.name)

    expect(toolNames[0]).toBe('Bash')
    expect(toolNames[1]).toBe('Read')
    expect(toolNames.indexOf('Glob')).toBeGreaterThan(toolNames.indexOf('Read'))
    expect(toolNames.indexOf('Grep')).toBeGreaterThan(toolNames.indexOf('Read'))
    expect(toolNames.indexOf('Glob')).toBeLessThan(toolNames.indexOf('Agent'))
    expect(toolNames.indexOf('Grep')).toBeLessThan(toolNames.indexOf('Agent'))
    expect(toolNames.indexOf('Agent')).toBeGreaterThan(toolNames.indexOf('Bash'))
    expect(toolNames.indexOf('ToolSearch')).toBeGreaterThan(toolNames.indexOf('Read'))
    expect(toolNames.indexOf('TodoWrite')).toBeGreaterThan(toolNames.indexOf('Write'))
  })

  it('keeps REPL-family tools opt-in only', () => {
    expect(getToolTier('REPL')).toBe('opt_in_only')
    expect(getToolTier('js_repl')).toBe('opt_in_only')
    expect(getToolTier('js_repl_reset')).toBe('opt_in_only')
    expect(getToolTier('py_repl')).toBe('opt_in_only')
    expect(getToolTier('py_repl_reset')).toBe('opt_in_only')
  })

  it('classifies higher-order helpers as second-line', () => {
    const secondLine = new Set(getToolNamesByTier('second_line'))
    expect(secondLine.has('Agent')).toBe(true)
    expect(secondLine.has('Glob')).toBe(true)
    expect(secondLine.has('Grep')).toBe(true)
    expect(secondLine.has('ToolSearch')).toBe(true)
    expect(secondLine.has('TodoWrite')).toBe(true)
    expect(secondLine.has('ListMcpResourcesTool')).toBe(true)
    expect(secondLine.has('ReadMcpResourceTool')).toBe(true)
  })

  it('classifies growthbook/env-only tools as gated', () => {
    const gated = new Set(getToolNamesByTier('gated'))
    expect(gated.has('Workflow')).toBe(true)
    expect(gated.has('LSP')).toBe(true)
    expect(gated.has('RemoteTrigger')).toBe(true)
    expect(gated.has('Config')).toBe(true)
    expect(gated.has('Tungsten')).toBe(true)
  })

  it('sorts known tools deterministically by policy tier and primary-tool order', () => {
    const sorted = sortToolsByPolicy(
      [
        { name: 'ToolSearch' },
        { name: 'REPL' },
        { name: 'Bash' },
        { name: 'Read' },
        { name: 'Agent' },
        { name: 'Grep' },
      ] as const,
    ).map(tool => tool.name)

    expect(sorted).toEqual(['Bash', 'Read', 'Grep', 'Agent', 'ToolSearch', 'REPL'])
  })
})
