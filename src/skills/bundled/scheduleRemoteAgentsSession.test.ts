import { describe, expect, test } from 'bun:test'
import { hasScheduleRemoteSkillSession } from './scheduleRemoteAgentsSession.js'

describe('hasScheduleRemoteSkillSession', () => {
  test('accepts usable full-scope managed remote sessions', () => {
    expect(
      hasScheduleRemoteSkillSession({
        principalSource: 'managed_oauth',
        sessionState: 'usable',
        accessToken: 'managed-access-token',
        scopes: ['user:profile', 'user:inference'],
      } as never),
    ).toBe(true)
  })

  test('rejects direct api-key sessions', () => {
    expect(
      hasScheduleRemoteSkillSession({
        principalSource: 'direct_api_key_env',
        sessionState: 'usable',
        accessToken: null,
        scopes: [],
      } as never),
    ).toBe(false)
  })

  test('rejects static byok env-key sessions', () => {
    expect(
      hasScheduleRemoteSkillSession({
        principalSource: 'direct_api_key_env',
        sessionState: 'usable',
        accessToken: null,
        scopes: [],
        providerPlan: {
          mode: 'byok_static_env',
          source: 'direct_api_key_env',
          staticKeyEnvVarName: 'ANTHROPIC_API_KEY',
        },
      } as never),
    ).toBe(false)
  })

  test('rejects managed sessions without profile scope', () => {
    expect(
      hasScheduleRemoteSkillSession({
        principalSource: 'managed_oauth',
        sessionState: 'usable',
        accessToken: 'managed-access-token',
        scopes: ['user:inference'],
      } as never),
    ).toBe(false)
  })

  test('rejects expired managed sessions', () => {
    expect(
      hasScheduleRemoteSkillSession({
        principalSource: 'managed_oauth',
        sessionState: 'expired',
        accessToken: 'managed-access-token',
        scopes: ['user:profile', 'user:inference'],
      } as never),
    ).toBe(false)
  })
})
