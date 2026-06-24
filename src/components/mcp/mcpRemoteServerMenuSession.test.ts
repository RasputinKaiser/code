import { describe, expect, test } from 'bun:test'
import { getManagedProxyOrganizationUuid } from './mcpRemoteServerMenuSession.js'

describe('getManagedProxyOrganizationUuid', () => {
  test('returns organization uuid for managed oauth sessions', () => {
    expect(
      getManagedProxyOrganizationUuid({
        principalSource: 'managed_oauth',
        identity: {
          email: 'user@noumena.net',
          accountUuid: 'acct-123',
          organizationUuid: 'org-123',
          organizationName: 'Noumena',
        },
      }),
    ).toBe('org-123')
  })

  test('returns null for non-managed sessions', () => {
    expect(
      getManagedProxyOrganizationUuid({
        principalSource: 'direct_api_key_env',
        identity: {
          email: null,
          accountUuid: null,
          organizationUuid: 'org-123',
          organizationName: null,
        },
      }),
    ).toBeNull()
  })

  test('returns null when managed session has no organization uuid', () => {
    expect(
      getManagedProxyOrganizationUuid({
        principalSource: 'managed_oauth',
        identity: {
          email: 'user@noumena.net',
          accountUuid: 'acct-123',
          organizationUuid: '   ',
          organizationName: 'Noumena',
        },
      }),
    ).toBeNull()
  })
})
