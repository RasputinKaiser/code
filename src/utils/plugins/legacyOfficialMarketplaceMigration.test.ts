import { afterEach, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { resetSettingsCache } from '../settings/settingsCache.js'
import {
  migrateLegacyOfficialMarketplaceState,
  resetLegacyOfficialMarketplaceMigrationStateForTesting,
} from './legacyOfficialMarketplaceMigration.js'

const envKeys = ['NCODE_CONFIG_DIR', 'CLAUDE_CONFIG_DIR'] as const
const originalEnv = Object.fromEntries(
  envKeys.map(key => [key, process.env[key]]),
) as Record<(typeof envKeys)[number], string | undefined>
const tempDirs: string[] = []

function restoreEnv(): void {
  for (const key of envKeys) {
    const originalValue = originalEnv[key]
    if (originalValue === undefined) delete process.env[key]
    else process.env[key] = originalValue
  }
}

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`))
  tempDirs.push(dir)
  return dir
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

afterEach(() => {
  resetLegacyOfficialMarketplaceMigrationStateForTesting()
  resetSettingsCache()
  restoreEnv()
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('legacy official marketplace migration', () => {
  test('loadInstalledPluginsV2 rewrites legacy official settings, known marketplaces, and installed plugin state', async () => {
    const configDir = makeTempDir('ncode-legacy-official-marketplace')
    process.env.NCODE_CONFIG_DIR = configDir
    process.env.CLAUDE_CONFIG_DIR = configDir

    const pluginsDir = join(configDir, 'plugins')
    const oldCachePath = join(
      pluginsDir,
      'cache',
      'claude-plugins-official',
      'pyright-lsp',
      '1.0.0',
    )
    const newCachePath = join(
      pluginsDir,
      'cache',
      'noumena-plugins-official',
      'pyright-lsp',
      '1.0.0',
    )
    const oldDataPath = join(
      pluginsDir,
      'data',
      'pyright-lsp-claude-plugins-official',
    )
    const newDataPath = join(
      pluginsDir,
      'data',
      'pyright-lsp-noumena-plugins-official',
    )

    mkdirSync(oldCachePath, { recursive: true })
    mkdirSync(oldDataPath, { recursive: true })
    mkdirSync(join(pluginsDir, 'marketplaces'), { recursive: true })
    writeFileSync(join(oldCachePath, 'plugin.json'), '{}')
    writeFileSync(join(oldDataPath, 'state.json'), '{}')
    writeFileSync(
      join(configDir, 'settings.json'),
      JSON.stringify(
        {
          enabledPlugins: {
            'pyright-lsp@claude-plugins-official': true,
            'other-plugin@third-party': true,
          },
        },
        null,
        2,
      ),
    )
    writeFileSync(
      join(pluginsDir, 'known_marketplaces.json'),
      JSON.stringify(
        {
          'claude-plugins-official': {
            source: {
              source: 'github',
              repo: 'anthropics/claude-plugins-official',
            },
            installLocation: join(
              pluginsDir,
              'marketplaces',
              'claude-plugins-official',
            ),
            lastUpdated: '2026-04-14T21:43:47.327Z',
          },
        },
        null,
        2,
      ),
    )
    writeFileSync(
      join(pluginsDir, 'installed_plugins.json'),
      JSON.stringify(
        {
          version: 2,
          plugins: {
            'pyright-lsp@claude-plugins-official': [
              {
                scope: 'user',
                installPath: oldCachePath,
                version: '1.0.0',
                installedAt: '2026-04-14T21:43:47.327Z',
                lastUpdated: '2026-04-14T21:43:47.327Z',
              },
            ],
          },
        },
        null,
        2,
      ),
    )

    const { loadInstalledPluginsV2 } = await import('./installedPluginsManager.js')
    const loadedPlugins = loadInstalledPluginsV2()
    expect(
      loadedPlugins.plugins['pyright-lsp@noumena-plugins-official'],
    ).toHaveLength(1)

    const settings = readJson(join(configDir, 'settings.json')) as {
      enabledPlugins: Record<string, boolean | undefined>
    }
    expect(settings.enabledPlugins['pyright-lsp@claude-plugins-official']).toBeUndefined()
    expect(settings.enabledPlugins['pyright-lsp@noumena-plugins-official']).toBe(true)
    expect(settings.enabledPlugins['other-plugin@third-party']).toBe(true)

    const knownMarketplaces = readJson(
      join(pluginsDir, 'known_marketplaces.json'),
    ) as Record<string, { source: { source: string; repo?: string }; installLocation: string }>
    expect(knownMarketplaces['claude-plugins-official']).toBeUndefined()
    expect(knownMarketplaces['noumena-plugins-official']).toMatchObject({
      source: { source: 'github', repo: 'noumena/ncode' },
      installLocation: join(
        pluginsDir,
        'marketplaces',
        'noumena-plugins-official',
      ),
    })

    const installedPlugins = readJson(
      join(pluginsDir, 'installed_plugins.json'),
    ) as {
      plugins: Record<string, Array<{ installPath: string }>>
    }
    expect(installedPlugins.plugins['pyright-lsp@claude-plugins-official']).toBeUndefined()
    expect(installedPlugins.plugins['pyright-lsp@noumena-plugins-official']?.[0]?.installPath).toBe(newCachePath)
    expect(existsSync(oldCachePath)).toBe(false)
    expect(existsSync(newCachePath)).toBe(true)
    expect(existsSync(oldDataPath)).toBe(false)
    expect(existsSync(newDataPath)).toBe(true)
  })
})
