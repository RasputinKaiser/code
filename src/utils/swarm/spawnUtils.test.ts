import { afterEach, describe, expect, it } from 'bun:test'

import {
  buildInheritedEnvVars,
  getTeammateCommand,
  buildTeammateLaunchCommand,
} from './spawnUtils.js'
import { TEAMMATE_COMMAND_ENV_VAR } from './constants.js'

const savedEnv = {
  NOUMENA_GROWTHBOOK_API_HOST: process.env.NOUMENA_GROWTHBOOK_API_HOST,
  NOUMENA_GROWTHBOOK_CLIENT_KEY: process.env.NOUMENA_GROWTHBOOK_CLIENT_KEY,
  [TEAMMATE_COMMAND_ENV_VAR]: process.env[TEAMMATE_COMMAND_ENV_VAR],
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

describe('buildInheritedEnvVars', () => {
  it('forwards Noumena GrowthBook overrides to teammate processes', () => {
    process.env.NOUMENA_GROWTHBOOK_API_HOST = 'https://flags.noumena.test'
    process.env.NOUMENA_GROWTHBOOK_CLIENT_KEY = 'sdk-noumena'

    const envVars = buildInheritedEnvVars()

    expect(envVars).toContain('NOUMENA_GROWTHBOOK_API_HOST=')
    expect(envVars).toMatch(
      /NOUMENA_GROWTHBOOK_API_HOST=.*flags\.noumena\.test/,
    )
    expect(envVars).toContain('NOUMENA_GROWTHBOOK_CLIENT_KEY=')
    expect(envVars).toContain('sdk-noumena')
  })
})

describe('buildTeammateLaunchCommand', () => {
  it('uses the native executable directly for bundled builds', () => {
    expect(
      buildTeammateLaunchCommand({
        isBundled: true,
        execPath: '/opt/ncode/ncode',
        scriptPath: '/repo/code/dist/cli.js',
      }),
    ).toBe('/opt/ncode/ncode')
  })

  it('prefixes the runtime for non-bundled script builds', () => {
    expect(
      buildTeammateLaunchCommand({
        isBundled: false,
        execPath: '/home/user/.bun/bin/bun',
        scriptPath: '/repo/code/dist/cli.js',
      }),
    ).toBe('/home/user/.bun/bin/bun /repo/code/dist/cli.js')
  })

  it('quotes runtime and script paths independently', () => {
    expect(
      buildTeammateLaunchCommand({
        isBundled: false,
        execPath: '/home/user/.bun/bin/bun',
        scriptPath: '/repo with spaces/code/dist/cli.js',
      }),
    ).toBe("/home/user/.bun/bin/bun '/repo with spaces/code/dist/cli.js'")
  })

  it('honors explicit teammate command overrides', () => {
    expect(
      buildTeammateLaunchCommand({
        commandOverride: '/custom/ncode',
        isBundled: false,
        execPath: '/home/user/.bun/bin/bun',
        scriptPath: '/repo/code/dist/cli.js',
      }),
    ).toBe('/custom/ncode')
  })

  it('keeps legacy getTeammateCommand on the safe shell launch contract', () => {
    process.env[TEAMMATE_COMMAND_ENV_VAR] = ''
    expect(getTeammateCommand()).toContain(process.execPath)
    if (process.argv[1]) {
      expect(getTeammateCommand()).toContain(process.argv[1])
    }
  })
})
