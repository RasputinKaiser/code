/**
 * Migration for pre-NCode official plugin marketplace state.
 *
 * Older installs used `claude-plugins-official` backed by
 * `anthropics/claude-plugins-official`. The current product-owned official
 * marketplace is `noumena-plugins-official` backed by `noumena/ncode`.
 *
 * This migration rewrites persisted intent/state. It does not invent new
 * plugin installs; it preserves user intent by moving plugin IDs to the new
 * marketplace suffix, and leaves missing plugin content to the normal
 * marketplace reconciler/cache loader.
 */

import { dirname, join, resolve, sep } from 'path'
import { logForDebugging } from '../debug.js'
import { isENOENT, toError } from '../errors.js'
import { getFsImplementation } from '../fsOperations.js'
import { logError } from '../log.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../settings/settings.js'
import type { SettingsJson } from '../settings/types.js'
import { jsonParse, jsonStringify, writeFileSync_DEPRECATED } from '../slowOperations.js'
import {
  OFFICIAL_MARKETPLACE_NAME,
  OFFICIAL_MARKETPLACE_SOURCE,
} from './officialMarketplace.js'
import {
  getPluginsDirectory,
  pluginDataDirPath,
} from './pluginDirectories.js'
import {
  InstalledPluginsFileSchemaV2,
  KnownMarketplacesFileSchema,
  type InstalledPluginsFileV2,
  type KnownMarketplacesFile,
  type MarketplaceSource,
} from './schemas.js'

const LEGACY_OFFICIAL_MARKETPLACE_NAMES = ['claude-plugins-official'] as const
const LEGACY_OFFICIAL_MARKETPLACE_REPOS = [
  'anthropics/claude-plugins-official',
] as const
const EDITABLE_SETTING_SOURCES = [
  'userSettings',
  'projectSettings',
  'localSettings',
] as const

let legacyOfficialMarketplaceMigrationCompleted = false

function isLegacyOfficialMarketplaceName(name: string | undefined): boolean {
  return Boolean(
    name &&
      LEGACY_OFFICIAL_MARKETPLACE_NAMES.some(
        legacyName => legacyName.toLowerCase() === name.toLowerCase(),
      ),
  )
}

function isLegacyOfficialMarketplaceSource(source: MarketplaceSource): boolean {
  return (
    source.source === 'github' &&
    LEGACY_OFFICIAL_MARKETPLACE_REPOS.some(
      repo => repo.toLowerCase() === source.repo?.toLowerCase(),
    )
  )
}

function migratePluginId(pluginId: string): string {
  for (const legacyName of LEGACY_OFFICIAL_MARKETPLACE_NAMES) {
    const suffix = `@${legacyName}`
    if (pluginId.endsWith(suffix)) {
      return `${pluginId.slice(0, -suffix.length)}@${OFFICIAL_MARKETPLACE_NAME}`
    }
  }
  return pluginId
}

function pathWithin(root: string, candidate: string): boolean {
  const resolvedRoot = resolve(root)
  const resolvedCandidate = resolve(candidate)
  return (
    resolvedCandidate === resolvedRoot ||
    resolvedCandidate.startsWith(resolvedRoot + sep)
  )
}

function rewriteManagedPath(
  filePath: string | undefined,
): string | undefined {
  if (!filePath) return filePath
  const pluginsDir = getPluginsDirectory()
  if (!pathWithin(pluginsDir, filePath)) return filePath

  let rewritten = filePath
  for (const legacyName of LEGACY_OFFICIAL_MARKETPLACE_NAMES) {
    rewritten = rewritten.replace(
      `${sep}cache${sep}${legacyName}${sep}`,
      `${sep}cache${sep}${OFFICIAL_MARKETPLACE_NAME}${sep}`,
    )
  }
  return rewritten
}

function ensureDirSync(dir: string): void {
  const fs = getFsImplementation()
  if (!dir || fs.existsSync(dir)) return
  const parent = dirname(dir)
  if (parent && parent !== dir) ensureDirSync(parent)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir)
}

function moveManagedPathIfPresent(from: string | undefined, to: string | undefined): void {
  if (!from || !to || from === to) return
  const fs = getFsImplementation()
  const pluginsDir = getPluginsDirectory()
  if (!pathWithin(pluginsDir, from) || !pathWithin(pluginsDir, to)) return
  try {
    if (!fs.existsSync(from) || fs.existsSync(to)) return
    ensureDirSync(dirname(to))
    fs.renameSync(from, to)
    logForDebugging(`Migrated legacy official plugin path ${from} -> ${to}`)
  } catch (error) {
    logForDebugging(
      `Failed to migrate legacy official plugin path ${from} -> ${to}: ${toError(error).message}`,
      { level: 'warn' },
    )
  }
}

function migrateSettingsEnabledPlugins(): number {
  let updatedSources = 0
  for (const source of EDITABLE_SETTING_SOURCES) {
    const settings = getSettingsForSource(source)
    const enabledPlugins = settings?.enabledPlugins
    const extraKnownMarketplaces = settings?.extraKnownMarketplaces
    if (!enabledPlugins && !extraKnownMarketplaces) continue

    const updates: SettingsJson = {}
    let changed = false

    if (enabledPlugins) {
      const nextEnabledPlugins = { ...enabledPlugins }
      for (const [pluginId, value] of Object.entries(enabledPlugins)) {
        const nextPluginId = migratePluginId(pluginId)
        if (nextPluginId === pluginId) continue
        if (nextEnabledPlugins[nextPluginId] === undefined) {
          nextEnabledPlugins[nextPluginId] = value
        }
        nextEnabledPlugins[pluginId] = undefined
        changed = true
      }
      if (changed) updates.enabledPlugins = nextEnabledPlugins
    }

    if (extraKnownMarketplaces) {
      const nextExtraKnownMarketplaces = { ...extraKnownMarketplaces }
      for (const [name, entry] of Object.entries(extraKnownMarketplaces)) {
        if (!isLegacyOfficialMarketplaceName(name)) continue
        if (
          entry &&
          typeof entry === 'object' &&
          'source' in entry &&
          !isLegacyOfficialMarketplaceSource(entry.source as MarketplaceSource)
        ) {
          continue
        }
        if (!nextExtraKnownMarketplaces[OFFICIAL_MARKETPLACE_NAME]) {
          nextExtraKnownMarketplaces[OFFICIAL_MARKETPLACE_NAME] = {
            source: OFFICIAL_MARKETPLACE_SOURCE,
          }
        }
        nextExtraKnownMarketplaces[name] = undefined
        changed = true
      }
      if (changed) updates.extraKnownMarketplaces = nextExtraKnownMarketplaces
    }

    if (!changed) continue
    const result = updateSettingsForSource(source, updates)
    if (result.error) {
      logError(result.error)
      continue
    }
    updatedSources++
  }
  return updatedSources
}

function knownMarketplacesFilePath(): string {
  return join(getPluginsDirectory(), 'known_marketplaces.json')
}

function loadKnownMarketplacesFile(): KnownMarketplacesFile | null {
  const fs = getFsImplementation()
  const filePath = knownMarketplacesFilePath()
  try {
    const content = fs.readFileSync(filePath, { encoding: 'utf-8' })
    const parsed = KnownMarketplacesFileSchema().safeParse(jsonParse(content))
    return parsed.success ? parsed.data : null
  } catch (error) {
    if (isENOENT(error)) return null
    throw error
  }
}

function saveKnownMarketplacesFile(config: KnownMarketplacesFile): void {
  const fs = getFsImplementation()
  const filePath = knownMarketplacesFilePath()
  fs.mkdirSync(dirname(filePath))
  writeFileSync_DEPRECATED(filePath, jsonStringify(config, null, 2), {
    encoding: 'utf-8',
    flush: true,
  })
}

function migrateKnownMarketplaces(): number {
  const config = loadKnownMarketplacesFile()
  if (!config) return 0

  let changed = 0
  for (const legacyName of LEGACY_OFFICIAL_MARKETPLACE_NAMES) {
    const legacyEntry = config[legacyName]
    if (!legacyEntry) continue
    if (!isLegacyOfficialMarketplaceSource(legacyEntry.source)) continue

    if (!config[OFFICIAL_MARKETPLACE_NAME]) {
      config[OFFICIAL_MARKETPLACE_NAME] = {
        source: OFFICIAL_MARKETPLACE_SOURCE,
        installLocation: join(
          getPluginsDirectory(),
          'marketplaces',
          OFFICIAL_MARKETPLACE_NAME,
        ),
        lastUpdated: legacyEntry.lastUpdated,
      }
    }
    delete config[legacyName]
    changed++
  }

  if (changed > 0) saveKnownMarketplacesFile(config)
  return changed
}

function installedPluginsFilePath(): string {
  return join(getPluginsDirectory(), 'installed_plugins.json')
}

function loadInstalledPluginsFile(): InstalledPluginsFileV2 | null {
  const fs = getFsImplementation()
  const filePath = installedPluginsFilePath()
  try {
    const content = fs.readFileSync(filePath, { encoding: 'utf-8' })
    const raw = jsonParse(content)
    if (raw?.version !== 2) return null
    return InstalledPluginsFileSchemaV2().parse(raw)
  } catch (error) {
    if (isENOENT(error)) return null
    throw error
  }
}

function saveInstalledPluginsFile(data: InstalledPluginsFileV2): void {
  const fs = getFsImplementation()
  const filePath = installedPluginsFilePath()
  fs.mkdirSync(dirname(filePath))
  writeFileSync_DEPRECATED(filePath, jsonStringify(data, null, 2), {
    encoding: 'utf-8',
    flush: true,
  })
}

function migrateInstalledPlugins(): number {
  const data = loadInstalledPluginsFile()
  if (!data) return 0

  let changed = 0
  for (const [pluginId, installations] of Object.entries(data.plugins)) {
    const nextPluginId = migratePluginId(pluginId)
    if (nextPluginId === pluginId) continue

    const migratedInstallations = installations.map(installation => {
      const nextInstallPath = rewriteManagedPath(installation.installPath)
      moveManagedPathIfPresent(installation.installPath, nextInstallPath)

      const oldDataDir = pluginDataDirPath(pluginId)
      const newDataDir = pluginDataDirPath(nextPluginId)
      moveManagedPathIfPresent(oldDataDir, newDataDir)

      return {
        ...installation,
        installPath: nextInstallPath ?? installation.installPath,
      }
    })

    data.plugins[nextPluginId] = [
      ...(data.plugins[nextPluginId] ?? []),
      ...migratedInstallations,
    ]
    delete data.plugins[pluginId]
    changed++
  }

  if (changed > 0) saveInstalledPluginsFile(data)
  return changed
}

export function migrateLegacyOfficialMarketplaceState(): void {
  if (legacyOfficialMarketplaceMigrationCompleted) return
  legacyOfficialMarketplaceMigrationCompleted = true

  try {
    const updatedSettingsSources = migrateSettingsEnabledPlugins()
    const migratedMarketplaces = migrateKnownMarketplaces()
    const migratedInstalledPlugins = migrateInstalledPlugins()
    if (
      updatedSettingsSources > 0 ||
      migratedMarketplaces > 0 ||
      migratedInstalledPlugins > 0
    ) {
      logForDebugging(
        `Migrated legacy official marketplace state: settings=${updatedSettingsSources}, marketplaces=${migratedMarketplaces}, installedPlugins=${migratedInstalledPlugins}`,
      )
    }
  } catch (error) {
    logForDebugging(
      `Failed to migrate legacy official marketplace state: ${toError(error).message}`,
      { level: 'warn' },
    )
    logError(toError(error))
  }
}

export function resetLegacyOfficialMarketplaceMigrationStateForTesting(): void {
  legacyOfficialMarketplaceMigrationCompleted = false
}
