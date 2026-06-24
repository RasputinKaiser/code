import { describe, expect, it } from 'bun:test'
import { getEmptyToolPermissionContext } from '../../Tool.js'
import { stripCliDenyRulesShadowingNestedAllows } from './toolWrappers.js'

describe('stripCliDenyRulesShadowingNestedAllows', () => {
  it('removes a base-tools whole-tool deny when Read is explicitly allowed for nested REPL use', () => {
    const context = {
      ...getEmptyToolPermissionContext(),
      alwaysAllowRules: { cliArg: ['REPL', 'Read'] },
      alwaysDenyRules: { cliArg: ['Read', 'Write'] },
    }

    const updated = stripCliDenyRulesShadowingNestedAllows(context, [
      { name: 'REPL' },
      { name: 'Read' },
    ] as never)

    expect(updated.alwaysDenyRules.cliArg).toEqual(['Write'])
  })

  it('removes a base-tools whole-tool deny when Bash only has a command-scoped allow', () => {
    const context = {
      ...getEmptyToolPermissionContext(),
      alwaysAllowRules: { cliArg: ['REPL', 'Bash(printf:*)'] },
      alwaysDenyRules: { cliArg: ['Bash', 'Read'] },
    }

    const updated = stripCliDenyRulesShadowingNestedAllows(context, [
      { name: 'REPL' },
      { name: 'Bash' },
    ] as never)

    expect(updated.alwaysDenyRules.cliArg).toEqual(['Read'])
  })
})
