import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'bun:test'
import { materializeEmbeddedAssetGroup } from './nativeAssetRuntime.js'

const argv1 = process.argv[1]

afterEach(() => {
  process.argv[1] = argv1
})

describe('materializeEmbeddedAssetGroup', () => {
  it('resolves bundled asset filenames relative to the invoked bundle directory', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'native-asset-runtime-'))

    try {
      const bundleDir = join(fixtureDir, 'dist')
      const bundlePath = join(bundleDir, 'cli.js')
      const assetName = 'rg-bundled-test.'
      const assetPath = join(bundleDir, assetName)

      mkdirSync(bundleDir, { recursive: true })
      writeFileSync(bundlePath, '// fake bundle entry')
      writeFileSync(assetPath, 'bundled-ripgrep')
      process.argv[1] = bundlePath

      const materialized = materializeEmbeddedAssetGroup('native-asset-runtime', [
        {
          embeddedPath: `../../${assetName}`,
          relativePath: 'vendor/ripgrep/x64-linux/rg',
          mode: 0o755,
        },
      ])

      expect(
        readFileSync(materialized.paths['vendor/ripgrep/x64-linux/rg'], 'utf8'),
      ).toBe('bundled-ripgrep')
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })
})
