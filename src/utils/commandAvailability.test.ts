import { beforeEach, describe, expect, it } from 'bun:test'
import {
  hasOauthCommandAvailabilitySession,
  meetsAvailabilityRequirementForContext,
  shouldDescribeLoginAsAccountSwitch,
  shouldIncludeFirstPartyAuthCommands,
} from './commandAvailability.js'

let currentSession: any = null
let firstPartyBaseUrl = true

function buildSession(overrides: Partial<any> = {}) {
  return {
    headersKind: 'none',
    principalSource: 'none',
    providerPlan: {
      mode: 'none',
    },
    scopes: [],
    ...overrides,
  }
}

function meetsAvailabilityRequirement(availability: string[]) {
  return meetsAvailabilityRequirementForContext(
    { availability } as { availability: ('claude-ai' | 'console')[] },
    {
      isFirstPartyBaseUrl: firstPartyBaseUrl,
      session: currentSession,
    },
  )
}

beforeEach(() => {
  currentSession = null
  firstPartyBaseUrl = true
})

describe('command availability canonical runtime helpers', () => {
  it('treats oauth-backed Noumena first-party sessions as claude-ai availability', () => {
    expect(
      hasOauthCommandAvailabilitySession(
        buildSession({
          headersKind: 'bearer',
          providerPlan: { mode: 'noumena_managed' },
          scopes: ['user:inference'],
        }),
      ),
    ).toBe(true)
  })

  it('rejects direct api-key and third-party sessions for claude-ai availability', () => {
    expect(
      hasOauthCommandAvailabilitySession(
        buildSession({
          headersKind: 'api_key',
          providerPlan: { mode: 'noumena_managed' },
        }),
      ),
    ).toBe(false)

    expect(
      hasOauthCommandAvailabilitySession(
        buildSession({
          headersKind: 'bearer',
          providerPlan: { mode: 'third_party_provider' },
          scopes: ['user:inference'],
        }),
      ),
    ).toBe(false)
  })

  it('preserves claude-ai command availability for service oauth sessions with inference scope', () => {
    currentSession = buildSession({
      headersKind: 'bearer',
      providerPlan: { mode: 'noumena_managed' },
      scopes: ['user:inference'],
    })

    expect(meetsAvailabilityRequirement(['claude-ai'])).toBe(true)
  })

  it('preserves console availability for first-party non-oauth sessions', () => {
    currentSession = buildSession({
      headersKind: 'api_key',
      providerPlan: { mode: 'byok_static_env' },
    })

    expect(meetsAvailabilityRequirement(['console'])).toBe(true)
  })

  it('hides console availability for third-party sessions or non-first-party base urls', () => {
    currentSession = buildSession({
      headersKind: 'none',
      providerPlan: { mode: 'third_party_provider' },
    })
    expect(meetsAvailabilityRequirement(['console'])).toBe(false)

    currentSession = null
    firstPartyBaseUrl = false
    expect(meetsAvailabilityRequirement(['console'])).toBe(false)
  })

  it('shows first-party auth commands unless the session is third-party provider mode', () => {
    expect(shouldIncludeFirstPartyAuthCommands(null)).toBe(true)
    expect(
      shouldIncludeFirstPartyAuthCommands(
        buildSession({
          providerPlan: { mode: 'third_party_provider' },
        }),
      ),
    ).toBe(false)
    expect(
      shouldIncludeFirstPartyAuthCommands(
        buildSession({
          providerPlan: { mode: 'noumena_managed' },
        }),
      ),
    ).toBe(true)
  })

  it('preserves login account-switch wording only for direct or console api-key sessions', () => {
    expect(
      shouldDescribeLoginAsAccountSwitch(
        buildSession({
          principalSource: 'direct_api_key_env',
        }),
      ),
    ).toBe(true)
    expect(
      shouldDescribeLoginAsAccountSwitch(
        buildSession({
          principalSource: 'console_api_key',
        }),
      ),
    ).toBe(true)
    expect(
      shouldDescribeLoginAsAccountSwitch(
        buildSession({
          principalSource: 'managed_oauth',
        }),
      ),
    ).toBe(false)
    expect(
      shouldDescribeLoginAsAccountSwitch(
        buildSession({
          principalSource: 'api_key_helper',
        }),
      ),
    ).toBe(false)
  })
})
