import { describe, expect, it } from 'bun:test'

import { getEmptyToolPermissionContext } from '../../Tool.js'
import { bashToolCheckPermission } from './bashPermissions.js'
import { checkReadOnlyConstraints } from './readOnlyValidation.js'

describe('checkReadOnlyConstraints sapling commands', () => {
  it('allows sl status in read-only mode', () => {
    expect(
      checkReadOnlyConstraints({ command: 'sl status' }, false).behavior,
    ).toBe('allow')
  })

  it('allows templated sl log history inspection', () => {
    expect(
      checkReadOnlyConstraints(
        { command: `sl log -r . -T '{node|short} {bookmarks}\\n'` },
        false,
      ).behavior,
    ).toBe('allow')
  })

  it('allows sl diff for read-only scm inspection', () => {
    expect(
      checkReadOnlyConstraints(
        { command: 'sl diff --rev .^ --rev . --stat' },
        false,
      ).behavior,
    ).toBe('allow')
  })
})

describe('bashToolCheckPermission sapling commands in dontAsk mode', () => {
  it('auto-allows sl status instead of denying it', () => {
    const toolPermissionContext = {
      ...getEmptyToolPermissionContext(),
      mode: 'dontAsk' as const,
    }

    expect(
      bashToolCheckPermission({ command: 'sl status' }, toolPermissionContext)
        .behavior,
    ).toBe('allow')
  })

  it('auto-allows sl log history inspection instead of denying it', () => {
    const toolPermissionContext = {
      ...getEmptyToolPermissionContext(),
      mode: 'dontAsk' as const,
    }

    expect(
      bashToolCheckPermission(
        { command: `sl log -r . -T '{node|short} {bookmarks}\\n'` },
        toolPermissionContext,
      ).behavior,
    ).toBe('allow')
  })
})
