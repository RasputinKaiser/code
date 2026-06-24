import { afterEach, describe, expect, it } from 'bun:test'
import {
  getDirectApiKeyEnvValue,
  getDirectApiKeyProviderMode,
  getDirectApiKeyEnvVarName,
} from './authEnv.js'

const originalNoumenaApiKey = process.env.NOUMENA_API_KEY
const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY

afterEach(() => {
  if (originalNoumenaApiKey === undefined) {
    delete process.env.NOUMENA_API_KEY
  } else {
    process.env.NOUMENA_API_KEY = originalNoumenaApiKey
  }

  if (originalAnthropicApiKey === undefined) {
    delete process.env.ANTHROPIC_API_KEY
  } else {
    process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey
  }
})

describe('auth env helpers', () => {
  it('prefers NOUMENA_API_KEY when both aliases are set', () => {
    process.env.NOUMENA_API_KEY = 'noumena-key'
    process.env.ANTHROPIC_API_KEY = 'anthropic-key'

    expect(getDirectApiKeyEnvVarName()).toBe('NOUMENA_API_KEY')
    expect(getDirectApiKeyEnvValue()).toBe('noumena-key')
    expect(getDirectApiKeyProviderMode()).toBe('noumena_managed')
  })

  it('falls back to ANTHROPIC_API_KEY when the Noumena alias is absent', () => {
    delete process.env.NOUMENA_API_KEY
    process.env.ANTHROPIC_API_KEY = 'anthropic-key'

    expect(getDirectApiKeyEnvVarName()).toBe('ANTHROPIC_API_KEY')
    expect(getDirectApiKeyEnvValue()).toBe('anthropic-key')
    expect(getDirectApiKeyProviderMode()).toBe('byok_static_env')
  })
})
