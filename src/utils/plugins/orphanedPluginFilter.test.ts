import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  clearPluginCacheExclusions,
  getGlobExclusionsForPluginCache,
} from './orphanedPluginFilter.js'

const previousPluginCacheDir = process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR

describe('orphaned plugin cache exclusions', () => {
  afterEach(() => {
    clearPluginCacheExclusions()
    if (previousPluginCacheDir === undefined) {
      delete process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR
    } else {
      process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR = previousPluginCacheDir
    }
  })

  it('returns no exclusions when the plugin cache directory does not exist', async () => {
    const fixtureDir = await mkdtemp(
      path.join(tmpdir(), 'ncode-plugin-cache-missing-'),
    )
    try {
      process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR = fixtureDir
      const exclusions = await getGlobExclusionsForPluginCache()
      expect(exclusions).toEqual([])
    } finally {
      await rm(fixtureDir, { recursive: true, force: true })
    }
  })
})
