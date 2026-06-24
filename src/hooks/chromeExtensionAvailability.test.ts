import { describe, expect, test } from 'bun:test'
import { shouldRequireChromeManagedAccountNotice } from './chromeExtensionAvailability.js'
import type { CommandAvailabilitySession } from '../utils/commandAvailability.js'

function makeOauthSession(): NonNullable<CommandAvailabilitySession> {
  return {
    headersKind: 'bearer',
    providerPlan: {
      mode: 'noumena_managed',
      source: 'managed_principal',
      staticKeyEnvVarName: null,
    },
    scopes: ['user:inference'],
    subscription: {
      subscriptionName: 'Max',
      subscriptionType: 'max',
      rateLimitTier: 'default',
    },
  }
}

describe('shouldRequireChromeManagedAccountNotice', () => {
  test('requires managed account notice for external sessions without oauth access', () => {
    expect(
      shouldRequireChromeManagedAccountNotice({
        buildMode: 'external',
        userType: 'external',
        session: null,
      }),
    ).toBe(true)
  })

  test('does not require notice for internal noumena builds', () => {
    expect(
      shouldRequireChromeManagedAccountNotice({
        buildMode: 'noumena',
        userType: 'external',
        session: null,
      }),
    ).toBe(false)
  })

  test('does not require notice when oauth-backed command availability is present', () => {
    expect(
      shouldRequireChromeManagedAccountNotice({
        buildMode: 'external',
        userType: 'external',
        session: makeOauthSession(),
      }),
    ).toBe(false)
  })
})
