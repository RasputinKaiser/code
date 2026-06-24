import { describe, expect, test } from 'bun:test'
import { hasUsableVoiceSession } from './voiceSession.js'

describe('hasUsableVoiceSession', () => {
  test('accepts oauth-backed first-party bearer sessions', () => {
    expect(
      hasUsableVoiceSession({
        providerPlan: {
          mode: 'noumena_managed',
          source: 'managed_principal',
          staticKeyEnvVarName: null,
        },
        headersKind: 'bearer',
        scopes: ['user:inference'],
        accessToken: 'managed-token',
      }),
    ).toBe(true)
  })

  test('accepts service bearer sessions with inference scope', () => {
    expect(
      hasUsableVoiceSession({
        providerPlan: {
          mode: 'noumena_managed',
          source: 'service_credential',
          staticKeyEnvVarName: null,
        },
        headersKind: 'bearer',
        scopes: ['user:inference'],
        accessToken: 'service-token',
      }),
    ).toBe(true)
  })

  test('rejects direct api-key sessions', () => {
    expect(
      hasUsableVoiceSession({
        providerPlan: {
          mode: 'noumena_managed',
          source: 'direct_api_key_env',
          staticKeyEnvVarName: 'NOUMENA_API_KEY',
        },
        headersKind: 'api_key',
        scopes: [],
        accessToken: null,
      }),
    ).toBe(false)
  })

  test('rejects static byok env-key sessions', () => {
    expect(
      hasUsableVoiceSession({
        providerPlan: {
          mode: 'byok_static_env',
          source: 'direct_api_key_env',
          staticKeyEnvVarName: 'ANTHROPIC_API_KEY',
        },
        headersKind: 'api_key',
        scopes: [],
        accessToken: null,
      }),
    ).toBe(false)
  })

  test('rejects bearer sessions without a usable token', () => {
    expect(
      hasUsableVoiceSession({
        providerPlan: {
          mode: 'noumena_managed',
          source: 'managed_principal',
          staticKeyEnvVarName: null,
        },
        headersKind: 'bearer',
        scopes: ['user:inference'],
        accessToken: null,
      }),
    ).toBe(false)
  })
})
