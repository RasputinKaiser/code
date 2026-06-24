import { describe, expect, test } from 'bun:test'
import {
  buildCommandSurfaceInventory,
  buildModelToolSurfaceInventory,
  collectSurfaceCapabilityCrosswalk,
} from './surfaceInventory.js'

describe('surfaceInventory', () => {
  test('separates model tools from slash commands', () => {
    const toolNames = new Set(
      buildModelToolSurfaceInventory(
        [
          { name: 'Bash' },
          { name: 'Config' },
          { name: 'TaskCreate' },
        ],
        'StructuredOutput',
      ).map(entry => entry.name),
    )
    const commandNames = new Set(
      buildCommandSurfaceInventory(
        [
          { name: 'config' },
          { name: 'plan' },
          { name: 'mcp' },
        ],
        [],
      ).map(entry => entry.name),
    )

    expect(toolNames.has('Bash')).toBe(true)
    expect(toolNames.has('Config')).toBe(true)
    expect(toolNames.has('config')).toBe(false)
    expect(toolNames.has('plan')).toBe(false)

    expect(commandNames.has('config')).toBe(true)
    expect(commandNames.has('plan')).toBe(true)
    expect(commandNames.has('Bash')).toBe(false)
  })

  test('includes known dynamic model-facing IDE tools and synthetic families', () => {
    const toolNames = new Set(
      buildModelToolSurfaceInventory([{ name: 'Bash' }], 'StructuredOutput').map(
        entry => entry.name,
      ),
    )

    expect(toolNames.has('mcp__ide__getDiagnostics')).toBe(true)
    expect(toolNames.has('mcp__ide__getEditorContext')).toBe(true)
    expect(toolNames.has('mcp__ide__getCodeActions')).toBe(true)
    expect(toolNames.has('mcp__ide__executeCode')).toBe(true)
    expect(toolNames.has('StructuredOutput')).toBe(true)
    expect(toolNames.has('mcp__<server>__authenticate')).toBe(true)
  })

  test('records command invocability separately from tool surfaces', () => {
    const commandEntries = buildCommandSurfaceInventory(
      [
        { name: 'config' },
        { name: 'mcp', disableModelInvocation: false },
        { name: 'hidden-skill', userInvocable: false },
      ],
      [{ name: 'hidden-skill' }],
    )
    const config = commandEntries.find(entry => entry.name === 'config')
    const mcp = commandEntries.find(entry => entry.name === 'mcp')
    const hiddenSkill = commandEntries.find(entry => entry.name === 'hidden-skill')

    expect(config).toBeDefined()
    expect(mcp).toBeDefined()
    expect(hiddenSkill?.internalOnly).toBe(true)
    expect(hiddenSkill?.userCallable).toBe(false)
    expect(config?.userCallable).toBe(true)
    expect(mcp?.modelCallable).toBe(true)
  })

  test('capability crosswalk stays small and intentional', () => {
    const rows = collectSurfaceCapabilityCrosswalk()

    expect(rows.length).toBeGreaterThan(0)
    expect(new Set(rows.map(row => row.capability)).size).toBe(rows.length)

    for (const row of rows) {
      expect(row.humanCommands.length).toBeGreaterThan(0)
      expect(row.modelTools.length).toBeGreaterThan(0)
      expect(row.notes.length).toBeGreaterThan(0)
    }
  })
})
