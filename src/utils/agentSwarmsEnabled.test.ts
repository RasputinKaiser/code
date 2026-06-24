import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { resetGrowthBook } from '../services/analytics/growthbook.js'
import { enableConfigs, getGlobalConfig, saveGlobalConfig } from './config.js'
import { isAgentSwarmsEnabled } from './agentSwarmsEnabled.js'

let tempConfigDir = ''

const originalNodeEnv = process.env.NODE_ENV
const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalUserType = process.env.USER_TYPE
const originalExperimentalTeams = process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
const originalFcOverrides = process.env.CLAUDE_INTERNAL_FC_OVERRIDES
const originalArgv = [...process.argv]
const originalCachedGrowthBookFeatures = {
  ...(getGlobalConfig().cachedGrowthBookFeatures ?? {}),
}

function restoreEnvVar(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

function setGrowthBookOverrides(overrides: Record<string, unknown>): void {
  process.env.USER_TYPE = 'ant'
  process.env.CLAUDE_INTERNAL_FC_OVERRIDES = JSON.stringify(overrides)
  resetGrowthBook()
}

function restoreCachedGrowthBookFeatures(): void {
  saveGlobalConfig(current => ({
    ...current,
    cachedGrowthBookFeatures: {
      ...originalCachedGrowthBookFeatures,
    },
  }))
}

function setCachedGrowthBookFeature(feature: string, value: unknown): void {
  saveGlobalConfig(current => ({
    ...current,
    cachedGrowthBookFeatures: {
      ...(current.cachedGrowthBookFeatures ?? {}),
      [feature]: value,
    },
  }))
}

beforeEach(() => {
  restoreEnvVar('NODE_ENV', originalNodeEnv)
  restoreEnvVar('CLAUDE_CONFIG_DIR', originalClaudeConfigDir)
  restoreEnvVar('USER_TYPE', originalUserType)
  restoreEnvVar(
    'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS',
    originalExperimentalTeams,
  )
  restoreEnvVar('CLAUDE_INTERNAL_FC_OVERRIDES', originalFcOverrides)
  process.argv.splice(0, process.argv.length, ...originalArgv)
  restoreCachedGrowthBookFeatures()
  resetGrowthBook()
})

afterEach(async () => {
  restoreEnvVar('NODE_ENV', originalNodeEnv)
  restoreEnvVar('CLAUDE_CONFIG_DIR', originalClaudeConfigDir)
  restoreEnvVar('USER_TYPE', originalUserType)
  restoreEnvVar(
    'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS',
    originalExperimentalTeams,
  )
  restoreEnvVar('CLAUDE_INTERNAL_FC_OVERRIDES', originalFcOverrides)
  process.argv.splice(0, process.argv.length, ...originalArgv)
  restoreCachedGrowthBookFeatures()
  resetGrowthBook()

  if (tempConfigDir) {
    await rm(tempConfigDir, { recursive: true, force: true })
    tempConfigDir = ''
  }
})

describe('isAgentSwarmsEnabled', () => {
  it('always enables swarms for ant users regardless of external gates', () => {
    setGrowthBookOverrides({ ncode_amber_flint: false })

    expect(isAgentSwarmsEnabled()).toBe(true)
  })

  it('disables swarms for external users without env or CLI opt-in', () => {
    delete process.env.USER_TYPE
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS

    expect(isAgentSwarmsEnabled()).toBe(false)
  })

  it('respects the killswitch for opted-in external users', async () => {
    tempConfigDir = await mkdtemp(join(tmpdir(), 'ncode-agent-swarms-'))
    process.env.NODE_ENV = 'development'
    process.env.CLAUDE_CONFIG_DIR = tempConfigDir
    delete process.env.USER_TYPE
    process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1'
    enableConfigs()
    setCachedGrowthBookFeature('ncode_amber_flint', false)
    resetGrowthBook()

    expect(isAgentSwarmsEnabled()).toBe(false)
  })

  it('accepts env opt-in for external users when the killswitch default is enabled', () => {
    delete process.env.USER_TYPE
    process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1'
    expect(isAgentSwarmsEnabled()).toBe(true)
  })

  it('accepts CLI opt-in for external users when the killswitch default is enabled', () => {
    delete process.env.USER_TYPE
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
    process.argv.push('--agent-teams')

    expect(isAgentSwarmsEnabled()).toBe(true)
  })
})
