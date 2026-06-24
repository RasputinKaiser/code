import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type MaterializedAsset = {
  embeddedPath: string
  relativePath: string
  mode?: number
}

export type MaterializedAssetGroup = {
  baseDir: string
  paths: Record<string, string>
}

function writeAtomically(targetPath: string, content: Buffer, mode?: number): void {
  mkdirSync(dirname(targetPath), { recursive: true })
  const temporaryPath = `${targetPath}.tmp.${process.pid}`
  writeFileSync(temporaryPath, content)
  if (mode !== undefined) {
    chmodSync(temporaryPath, mode)
  }
  renameSync(temporaryPath, targetPath)
}

function sanitizeGroupKey(groupKey: string): string {
  return groupKey.replace(/[^a-zA-Z0-9._-]+/g, '-')
}

function getRuntimeAssetCandidateDirs(): string[] {
  const directories = new Set<string>()

  try {
    directories.add(dirname(fileURLToPath(import.meta.url)))
  } catch {
    // Ignore URL resolution failures; other runtime locations may still work.
  }

  const invokedPath = process.argv[1]
  if (invokedPath) {
    directories.add(dirname(resolve(invokedPath)))
  }

  const execPath = process.execPath || process.argv[0]
  if (execPath) {
    directories.add(dirname(resolve(execPath)))
  }

  return [...directories]
}

function resolveEmbeddedAssetPath(embeddedPath: string): string {
  if (isAbsolute(embeddedPath) && existsSync(embeddedPath)) {
    return embeddedPath
  }

  if (existsSync(embeddedPath)) {
    return embeddedPath
  }

  const embeddedFileName = basename(embeddedPath)
  for (const runtimeDir of getRuntimeAssetCandidateDirs()) {
    const runtimeRelativeCandidate = resolve(runtimeDir, embeddedPath)
    if (existsSync(runtimeRelativeCandidate)) {
      return runtimeRelativeCandidate
    }

    const colocatedCandidate = join(runtimeDir, embeddedFileName)
    if (existsSync(colocatedCandidate)) {
      return colocatedCandidate
    }
  }

  return embeddedPath
}

export function materializeEmbeddedAssetGroup(
  groupKey: string,
  assets: readonly MaterializedAsset[],
): MaterializedAssetGroup {
  const hash = createHash('sha256')
  for (const asset of assets) {
    hash.update(asset.relativePath)
    hash.update(readFileSync(resolveEmbeddedAssetPath(asset.embeddedPath)))
  }

  const baseDir = join(
    tmpdir(),
    'ncode-native-assets',
    `${sanitizeGroupKey(groupKey)}-${hash.digest('hex').slice(0, 16)}`,
  )
  const paths: Record<string, string> = {}

  for (const asset of assets) {
    const targetPath = join(baseDir, asset.relativePath)
    paths[asset.relativePath] = targetPath
    if (!existsSync(targetPath)) {
      writeAtomically(
        targetPath,
        Buffer.from(readFileSync(resolveEmbeddedAssetPath(asset.embeddedPath))),
        asset.mode,
      )
    }
  }

  return {
    baseDir,
    paths,
  }
}
