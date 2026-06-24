import { describe, expect, test } from 'bun:test'

import { shouldSkipOAuthOnboardingStepForSession } from './Onboarding.js'

describe('shouldSkipOAuthOnboardingStepForSession', () => {
  test('skips OAuth when a usable managed token already exists', () => {
    expect(
      shouldSkipOAuthOnboardingStepForSession({
        principalKind: 'noumena_account',
      }),
    ).toBe(true)
  })

  test('skips OAuth when managed account info already exists', () => {
    expect(
      shouldSkipOAuthOnboardingStepForSession({
        principalKind: 'noumena_account',
      }),
    ).toBe(true)
  })

  test('skips OAuth when API key auth already exists', () => {
    expect(
      shouldSkipOAuthOnboardingStepForSession({
        principalKind: 'api_key_user',
      }),
    ).toBe(true)
  })

  test('keeps OAuth step when there is no usable auth yet', () => {
    expect(
      shouldSkipOAuthOnboardingStepForSession({
        principalKind: 'none',
      }),
    ).toBe(false)
  })

  test('keeps OAuth step for session-ingress-only transport state with no principal session', () => {
    expect(
      shouldSkipOAuthOnboardingStepForSession({
        principalKind: 'none',
      }),
    ).toBe(false)
  })
})
