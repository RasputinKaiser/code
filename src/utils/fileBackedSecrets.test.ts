import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadFileBackedSecrets } from './fileBackedSecrets.js'

const ENV_VARS = [
  'NCODE_CONFIG_DIR',
  'CLAUDE_CONFIG_DIR',
  'EXA_API_KEY',
  'BRAVE_SEARCH_API_KEY',
  'BRAVE_API_KEY',
  'NCODE_EXA_API_KEY_FILE',
  'NCODE_BRAVE_SEARCH_API_KEY_FILE',
  'NCODE_BRAVE_API_KEY_FILE',
  'NCODE_STAGING_EXA_API_KEY_FILE',
  'NCODE_STAGING_BRAVE_SEARCH_API_KEY_FILE',
  'NCODE_STAGING_BRAVE_API_KEY_FILE',
] as const

const ORIGINAL_ENV = Object.fromEntries(
  ENV_VARS.map(key => [key, process.env[key]]),
) as Record<(typeof ENV_VARS)[number], string | undefined>

afterEach(() => {
  for (const envVar of ENV_VARS) {
    const original = ORIGINAL_ENV[envVar]
    if (original === undefined) {
      delete process.env[envVar]
    } else {
      process.env[envVar] = original
    }
  }
})

describe('loadFileBackedSecrets', () => {
  it('loads default config-dir secret files when env vars are unset', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'ncode-file-secrets-'))
    try {
      process.env.NCODE_CONFIG_DIR = configDir
      await writeFile(join(configDir, 'exa_api_key'), 'exa-secret\n', 'utf8')
      await writeFile(
        join(configDir, 'brave_search_api_key'),
        'brave-search-secret\n',
        'utf8',
      )
      await writeFile(join(configDir, 'brave_api_key'), 'brave-secret\n', 'utf8')

      loadFileBackedSecrets()

      expect(process.env.EXA_API_KEY).toBe('exa-secret')
      expect(process.env.BRAVE_SEARCH_API_KEY).toBe('brave-search-secret')
      expect(process.env.BRAVE_API_KEY).toBe('brave-secret')
    } finally {
      await rm(configDir, { recursive: true, force: true })
    }
  })

  it('honors explicit per-secret override paths, including staging env names', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'ncode-file-secrets-'))
    const overrideDir = await mkdtemp(join(tmpdir(), 'ncode-file-secrets-override-'))
    try {
      process.env.NCODE_CONFIG_DIR = configDir
      const exaOverride = join(overrideDir, 'exa')
      const braveOverride = join(overrideDir, 'brave-search')
      await writeFile(exaOverride, 'override-exa\n', 'utf8')
      await writeFile(braveOverride, 'override-brave-search\n', 'utf8')
      process.env.NCODE_STAGING_EXA_API_KEY_FILE = exaOverride
      process.env.NCODE_STAGING_BRAVE_SEARCH_API_KEY_FILE = braveOverride

      loadFileBackedSecrets()

      expect(process.env.EXA_API_KEY).toBe('override-exa')
      expect(process.env.BRAVE_SEARCH_API_KEY).toBe('override-brave-search')
    } finally {
      await rm(configDir, { recursive: true, force: true })
      await rm(overrideDir, { recursive: true, force: true })
    }
  })

  it('never overwrites already-populated environment variables', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'ncode-file-secrets-'))
    try {
      process.env.NCODE_CONFIG_DIR = configDir
      process.env.EXA_API_KEY = 'already-set'
      await writeFile(join(configDir, 'exa_api_key'), 'replacement\n', 'utf8')

      loadFileBackedSecrets()

      expect(process.env.EXA_API_KEY).toBe('already-set')
    } finally {
      await rm(configDir, { recursive: true, force: true })
    }
  })
})
