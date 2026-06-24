import { describe, expect, test } from 'bun:test'

import {
  getDualAuthConflictSources,
  getManagedKeyConflictSource,
  getManagedSubscriberCredentialConflictSource,
} from './statusNoticeDefinitions.js'

describe('getManagedSubscriberCredentialConflictSource', () => {
  test('detects managed-subscriber overrides from external bearer and apiKeyHelper principals', () => {
    expect(
      getManagedSubscriberCredentialConflictSource(
        {
          principalSource: 'external_bearer_compat',
          rawAuthTokenSource: 'ANTHROPIC_AUTH_TOKEN',
          rawApiKeySource: null,
        },
        'max',
      ),
    ).toBe('ANTHROPIC_AUTH_TOKEN')

    expect(
      getManagedSubscriberCredentialConflictSource(
        {
          principalSource: 'api_key_helper',
          rawAuthTokenSource: 'apiKeyHelper',
          rawApiKeySource: 'apiKeyHelper',
        },
        'team',
      ),
    ).toBe('apiKeyHelper')
  })

  test('does not warn when no managed subscriber exists or principal is canonical managed auth', () => {
    expect(
      getManagedSubscriberCredentialConflictSource(
        {
          principalSource: 'external_bearer_compat',
          rawAuthTokenSource: 'ANTHROPIC_AUTH_TOKEN',
          rawApiKeySource: null,
        },
        null,
      ),
    ).toBeNull()

    expect(
      getManagedSubscriberCredentialConflictSource(
        {
          principalSource: 'managed_oauth',
          rawAuthTokenSource: 'noumena.com',
          rawApiKeySource: null,
        },
        'max',
      ),
    ).toBeNull()
  })
})

describe('getManagedKeyConflictSource', () => {
  test('detects env and helper API key conflicts against stored managed keys', () => {
    expect(
      getManagedKeyConflictSource(
        {
          principalSource: 'direct_api_key_env',
          rawAuthTokenSource: null,
          rawApiKeySource: 'NOUMENA_API_KEY',
        },
        true,
      ),
    ).toBe('NOUMENA_API_KEY')

    expect(
      getManagedKeyConflictSource(
        {
          principalSource: 'api_key_helper',
          rawAuthTokenSource: 'apiKeyHelper',
          rawApiKeySource: 'apiKeyHelper',
        },
        true,
      ),
    ).toBe('apiKeyHelper')
  })

  test('does not warn without a stored managed key or when no conflicting API key exists', () => {
    expect(
      getManagedKeyConflictSource(
        {
          principalSource: 'direct_api_key_env',
          rawAuthTokenSource: null,
          rawApiKeySource: 'NOUMENA_API_KEY',
        },
        false,
      ),
    ).toBeNull()

    expect(
      getManagedKeyConflictSource(
        {
          principalSource: 'managed_oauth',
          rawAuthTokenSource: 'noumena.com',
          rawApiKeySource: '/login managed key',
        },
        true,
      ),
    ).toBeNull()
  })
})

describe('getDualAuthConflictSources', () => {
  test('detects concurrent token and API key sources', () => {
    expect(
      getDualAuthConflictSources({
        principalSource: 'managed_oauth',
        rawAuthTokenSource: 'noumena.com',
        rawApiKeySource: 'NOUMENA_API_KEY',
      }),
    ).toEqual({
      authTokenSource: 'noumena.com',
      apiKeySource: 'NOUMENA_API_KEY',
    })
  })

  test('ignores empty and duplicated apiKeyHelper-only cases', () => {
    expect(
      getDualAuthConflictSources({
        principalSource: 'none',
        rawAuthTokenSource: null,
        rawApiKeySource: 'NOUMENA_API_KEY',
      }),
    ).toBeNull()

    expect(
      getDualAuthConflictSources({
        principalSource: 'api_key_helper',
        rawAuthTokenSource: 'apiKeyHelper',
        rawApiKeySource: 'apiKeyHelper',
      }),
    ).toBeNull()
  })
})
