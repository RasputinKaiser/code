import { describe, expect, it } from 'bun:test'

import {
  SAFE_ENV_VARS,
  isProviderManagedEnvVar,
} from './managedEnvConstants.js'

describe('managedEnvConstants GrowthBook ownership', () => {
  it('treats Noumena GrowthBook routing vars as provider-managed and unsafe', () => {
    for (const key of [
      'NOUMENA_GROWTHBOOK_API_HOST',
      'NOUMENA_GROWTHBOOK_CLIENT_KEY',
    ]) {
      expect(isProviderManagedEnvVar(key)).toBe(true)
      expect(SAFE_ENV_VARS.has(key)).toBe(false)
    }
  })
})
