import { describe, expect, test } from 'bun:test'
import {
  hasRemoteCalloutSession,
  shouldShowRemoteCalloutForState,
} from './RemoteCallout.js'

function makeManagedSession(overrides: Record<string, unknown> = {}) {
  return {
    principalSource: 'managed_oauth',
    sessionState: 'usable',
    accessToken: 'managed-token',
    scopes: ['user:inference', 'user:profile'],
    ...overrides,
  }
}

describe('hasRemoteCalloutSession', () => {
  test('accepts usable managed sessions with an access token', () => {
    expect(hasRemoteCalloutSession(makeManagedSession())).toBe(true)
  })

  test('rejects expired managed sessions', () => {
    expect(
      hasRemoteCalloutSession(
        makeManagedSession({
          sessionState: 'expired',
          accessToken: null,
        }),
      ),
    ).toBe(false)
  })

  test('rejects non-managed sessions', () => {
    expect(
      hasRemoteCalloutSession(
        makeManagedSession({
          principalSource: 'direct_api_key_env',
        }),
      ),
    ).toBe(false)
  })
})

describe('shouldShowRemoteCalloutForState', () => {
  test('shows when unseen, bridge-enabled, and managed session is usable', () => {
    expect(
      shouldShowRemoteCalloutForState({
        remoteDialogSeen: false,
        bridgeEnabled: true,
        session: makeManagedSession(),
      }),
    ).toBe(true)
  })

  test('hides when bridge is disabled', () => {
    expect(
      shouldShowRemoteCalloutForState({
        remoteDialogSeen: false,
        bridgeEnabled: false,
        session: makeManagedSession(),
      }),
    ).toBe(false)
  })

  test('hides when the dialog has already been seen', () => {
    expect(
      shouldShowRemoteCalloutForState({
        remoteDialogSeen: true,
        bridgeEnabled: true,
        session: makeManagedSession(),
      }),
    ).toBe(false)
  })
})
