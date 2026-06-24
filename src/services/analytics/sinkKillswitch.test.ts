import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { resetGrowthBook } from './growthbook.js'
import { isSinkKilled } from './sinkKillswitch.js'

const originalUserType = process.env.USER_TYPE
const originalFcOverrides = process.env.CLAUDE_INTERNAL_FC_OVERRIDES

function restoreEnvVar(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

function setSinkKillswitchConfig(raw: unknown): void {
  process.env.USER_TYPE = 'ant'
  process.env.CLAUDE_INTERNAL_FC_OVERRIDES = JSON.stringify({
    ncode_frond_boric: raw,
  })
  resetGrowthBook()
}

beforeEach(() => {
  restoreEnvVar('USER_TYPE', originalUserType)
  restoreEnvVar('CLAUDE_INTERNAL_FC_OVERRIDES', originalFcOverrides)
  resetGrowthBook()
})

afterEach(() => {
  restoreEnvVar('USER_TYPE', originalUserType)
  restoreEnvVar('CLAUDE_INTERNAL_FC_OVERRIDES', originalFcOverrides)
  resetGrowthBook()
})

describe('isSinkKilled', () => {
  it('kills only the explicitly enabled sink', () => {
    setSinkKillswitchConfig({ datadog: true, firstParty: false })

    expect(isSinkKilled('datadog')).toBe(true)
    expect(isSinkKilled('firstParty')).toBe(false)
  })

  it('fails open when the config is missing or malformed', () => {
    setSinkKillswitchConfig(null)
    expect(isSinkKilled('datadog')).toBe(false)

    setSinkKillswitchConfig('unexpected-shape')
    expect(isSinkKilled('firstParty')).toBe(false)
  })

  it('leaves sinks enabled when their key is absent', () => {
    setSinkKillswitchConfig({ firstParty: true })

    expect(isSinkKilled('datadog')).toBe(false)
  })
})
