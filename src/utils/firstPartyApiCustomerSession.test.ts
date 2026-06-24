import { describe, expect, test } from 'bun:test'

import { isFirstPartyApiCustomerSession } from './firstPartyApiCustomerSession.js'

describe('firstPartyApiCustomerSession', () => {
  test('treats unauthenticated and non-managed first-party sessions as api customers', () => {
    expect(isFirstPartyApiCustomerSession(null, 'firstParty')).toBe(true)
    expect(
      isFirstPartyApiCustomerSession(
        {
          principalSource: 'direct_api_key_env',
          headersKind: 'api_key',
          scopes: [],
        },
        'firstParty',
      ),
    ).toBe(true)
    expect(
      isFirstPartyApiCustomerSession(
        {
          principalSource: 'console_api_key',
          headersKind: 'api_key',
          scopes: [],
        },
        'firstParty',
      ),
    ).toBe(true)
    expect(
      isFirstPartyApiCustomerSession(
        {
          principalSource: 'service_oauth_env',
          headersKind: 'bearer',
          scopes: ['user:inference'],
        },
        'firstParty',
      ),
    ).toBe(true)
  })

  test('rejects oauth-backed managed sessions and non-first-party providers', () => {
    expect(
      isFirstPartyApiCustomerSession(
        {
          principalSource: 'managed_oauth',
          headersKind: 'bearer',
          scopes: ['user:inference'],
        },
        'firstParty',
      ),
    ).toBe(false)
    expect(
      isFirstPartyApiCustomerSession(
        {
          principalSource: 'managed_oauth',
          headersKind: 'bearer',
          scopes: ['user:inference'],
        },
        'vertex',
      ),
    ).toBe(false)
  })
})
