import { describe, expect, test } from 'bun:test'
import { buildConsoleOAuthSessionState } from './consoleOAuthSession.js'

describe('buildConsoleOAuthSessionState', () => {
  test('returns the canonical session email when available', () => {
    expect(
      buildConsoleOAuthSessionState({
        headersKind: 'bearer',
        hasUsableToken: true,
        identity: {
          email: 'user@noumena.net',
        },
        principalSource: 'managed_oauth',
        providerAuthKind: 'noumena_first_party',
        rawApiKeySource: null,
        sessionState: 'usable',
      }),
    ).toEqual({
      email: 'user@noumena.net',
      canReuseManagedLogin: true,
      canReuseConsoleLogin: false,
    })
  })

  test('marks console api-key sessions as reusable for console login', () => {
    expect(
      buildConsoleOAuthSessionState({
        headersKind: 'api_key',
        hasUsableToken: false,
        identity: {
          email: 'user@noumena.net',
        },
        principalSource: 'console_api_key',
        providerAuthKind: 'noumena_first_party',
        rawApiKeySource: '/login managed key',
        sessionState: 'usable',
      }),
    ).toEqual({
      email: 'user@noumena.net',
      canReuseManagedLogin: false,
      canReuseConsoleLogin: true,
    })
  })

  test('returns null when no canonical session email is available', () => {
    expect(
      buildConsoleOAuthSessionState({
        headersKind: 'none',
        hasUsableToken: false,
        identity: {
          email: null,
        },
        principalSource: 'none',
        providerAuthKind: 'none',
        rawApiKeySource: null,
        sessionState: 'unauthenticated',
      }),
    ).toEqual({
      email: null,
      canReuseManagedLogin: false,
      canReuseConsoleLogin: false,
    })
    expect(buildConsoleOAuthSessionState(null)).toEqual({
      email: null,
      canReuseManagedLogin: false,
      canReuseConsoleLogin: false,
    })
  })
})
