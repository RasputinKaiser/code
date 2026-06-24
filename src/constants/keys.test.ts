import { afterEach, describe, expect, it } from 'bun:test'

import {
  ANT_GROWTHBOOK_DEV_CLIENT_KEY,
  NOUMENA_GROWTHBOOK_CLIENT_KEY_DEFAULT,
  getGrowthBookClientKey,
} from './keys.js'

const savedEnv = {
  ENABLE_GROWTHBOOK_DEV: process.env.ENABLE_GROWTHBOOK_DEV,
  NOUMENA_GROWTHBOOK_CLIENT_KEY: process.env.NOUMENA_GROWTHBOOK_CLIENT_KEY,
  USER_TYPE: process.env.USER_TYPE,
}

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
})

describe('getGrowthBookClientKey', () => {
  it('prefers the explicit Noumena GrowthBook client key override', () => {
    process.env.NOUMENA_GROWTHBOOK_CLIENT_KEY = ' sdk-noumena-override '
    process.env.USER_TYPE = 'ant'
    process.env.ENABLE_GROWTHBOOK_DEV = '1'

    expect(getGrowthBookClientKey()).toBe('sdk-noumena-override')
  })

  it('preserves the ant dev client key fallback when no Noumena override is set', () => {
    delete process.env.NOUMENA_GROWTHBOOK_CLIENT_KEY
    process.env.USER_TYPE = 'ant'
    process.env.ENABLE_GROWTHBOOK_DEV = '1'

    expect(getGrowthBookClientKey()).toBe(ANT_GROWTHBOOK_DEV_CLIENT_KEY)
  })

  it('does not ship a public client key by default', () => {
    delete process.env.NOUMENA_GROWTHBOOK_CLIENT_KEY
    delete process.env.USER_TYPE
    delete process.env.ENABLE_GROWTHBOOK_DEV

    expect(getGrowthBookClientKey()).toBeUndefined()
  })
})
