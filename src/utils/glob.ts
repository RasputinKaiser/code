import { basename, dirname, isAbsolute, join, relative, sep } from 'path'
import picomatch from 'picomatch'
import type { ToolPermissionContext } from '../Tool.js'
import { getFsImplementation } from './fsOperations.js'
import { isEnvTruthy } from './envUtils.js'
import {
  getFileReadIgnorePatterns,
  normalizePatternsToPath,
} from './permissions/filesystem.js'
import { getPlatform } from './platform.js'
import { getGlobExclusionsForPluginCache } from './plugins/orphanedPluginFilter.js'
import { ripGrep } from './ripgrep.js'

/**
 * Extracts the static base directory from a glob pattern.
 * The base directory is everything before the first glob special character (* ? [ {).
 * Returns the directory portion and the remaining relative pattern.
 */
export function extractGlobBaseDirectory(pattern: string): {
  baseDir: string
  relativePattern: string
} {
  // Find the first glob special character: *, ?, [, {
  const globChars = /[*?[{]/
  const match = pattern.match(globChars)

  if (!match || match.index === undefined) {
    // No glob characters - this is a literal path
    // Return the directory portion and filename as pattern
    const dir = dirname(pattern)
    const file = basename(pattern)
    return { baseDir: dir, relativePattern: file }
  }

  // Get everything before the first glob character
  const staticPrefix = pattern.slice(0, match.index)

  // Find the last path separator in the static prefix
  const lastSepIndex = Math.max(
    staticPrefix.lastIndexOf('/'),
    staticPrefix.lastIndexOf(sep),
  )

  if (lastSepIndex === -1) {
    // No path separator before the glob - pattern is relative to cwd
    return { baseDir: '', relativePattern: pattern }
  }

  let baseDir = staticPrefix.slice(0, lastSepIndex)
  const relativePattern = pattern.slice(lastSepIndex + 1)

  // Handle root directory patterns (e.g., /*.txt on Unix or C:/*.txt on Windows)
  // When lastSepIndex is 0, baseDir is empty but we need to use '/' as the root
  if (baseDir === '' && lastSepIndex === 0) {
    baseDir = '/'
  }

  // Handle Windows drive root paths (e.g., C:/*.txt)
  // 'C:' means "current directory on drive C" (relative), not root
  // We need 'C:/' or 'C:\' for the actual drive root
  if (getPlatform() === 'windows' && /^[A-Za-z]:$/.test(baseDir)) {
    baseDir = baseDir + sep
  }

  return { baseDir, relativePattern }
}

function isDirectoryGlobPattern(pattern: string): boolean {
  return pattern.endsWith('/') || pattern.endsWith(sep)
}

function normalizeGlobPattern(pattern: string): string {
  const normalized = pattern.replaceAll('\\', '/')
  return normalized.startsWith('./') ? normalized.slice(2) : normalized
}

export function buildFileGlobRipgrepArgs({
  ignorePatterns,
  pluginExclusions,
  noIgnore,
  hidden,
}: {
  ignorePatterns: string[]
  pluginExclusions: string[]
  noIgnore: boolean
  hidden: boolean
}): string[] {
  const args = [
    '--files',
    ...(noIgnore ? ['--no-ignore'] : []),
    ...(hidden ? ['--hidden'] : []),
  ]

  for (const pattern of ignorePatterns) {
    args.push('--glob', `!${pattern}`)
  }

  for (const exclusion of pluginExclusions) {
    args.push('--glob', exclusion)
  }

  return args
}

async function sortFileMatchesByModifiedTime(
  paths: string[],
  abortSignal: AbortSignal,
): Promise<string[]> {
  const fs = getFsImplementation()
  const matches: Array<{ path: string; mtimeMs: number }> = []
  const batchSize = 256

  for (let i = 0; i < paths.length; i += batchSize) {
    if (abortSignal.aborted) {
      throw abortSignal.reason ?? new Error('Glob aborted')
    }

    const batch = paths.slice(i, i + batchSize)
    const stats = await Promise.allSettled(batch.map(path => fs.stat(path)))
    for (let j = 0; j < batch.length; j++) {
      const result = stats[j]!
      matches.push({
        path: batch[j]!,
        mtimeMs:
          result.status === 'fulfilled' ? (result.value.mtimeMs ?? 0) : 0,
      })
    }
  }

  matches.sort(
    (a, b) => a.mtimeMs - b.mtimeMs || a.path.localeCompare(b.path),
  )
  return matches.map(match => match.path)
}

function getDirectoryGlobMaxDepth(pattern: string): number {
  const normalized = normalizeGlobPattern(pattern).replace(/\/+$/, '')
  if (normalized.includes('**')) {
    return Number.POSITIVE_INFINITY
  }
  if (!normalized) {
    return 0
  }
  return normalized.split('/').filter(Boolean).length
}

function hasGlobCharacters(pattern: string): boolean {
  return /[*?[{]/.test(pattern)
}

function isRecursiveLiteralDirectoryNamePattern(pattern: string): boolean {
  const normalized = normalizeGlobPattern(pattern).replace(/\/+$/, '')
  const parts = normalized.split('/').filter(Boolean)
  const lastSegment = parts.at(-1) ?? ''
  if (!lastSegment || hasGlobCharacters(lastSegment) || lastSegment.includes('.')) {
    return false
  }
  return normalized.includes('**/')
}

async function isExactDirectoryPattern(
  searchPattern: string,
  searchDir: string,
): Promise<boolean> {
  const normalized = normalizeGlobPattern(searchPattern).replace(/\/+$/, '')
  if (!normalized || hasGlobCharacters(normalized)) {
    return false
  }
  try {
    const fs = getFsImplementation()
    const stats = await fs.stat(join(searchDir, normalized))
    return stats.isDirectory()
  } catch {
    return false
  }
}

async function globDirectories(
  searchPattern: string,
  searchDir: string,
  ignorePatterns: string[],
  abortSignal: AbortSignal,
): Promise<string[]> {
  const fs = getFsImplementation()
  const normalizedPattern = normalizeGlobPattern(
    searchPattern.endsWith('/') ? searchPattern : `${searchPattern}/`,
  )
  const matcher = picomatch(normalizedPattern, {
    dot: true,
    nocase: getPlatform() === 'windows',
  })
  const ignoreMatchers = ignorePatterns.map(pattern =>
    picomatch(normalizeGlobPattern(pattern.replace(/^!/, '')), {
      dot: true,
      nocase: getPlatform() === 'windows',
    }),
  )
  const maxDepth = getDirectoryGlobMaxDepth(normalizedPattern)
  const matches: Array<{ path: string; mtimeMs: number }> = []

  function shouldIgnore(relativePath: string): boolean {
    const withSlash = relativePath.endsWith('/')
      ? relativePath
      : `${relativePath}/`
    return ignoreMatchers.some(
      isMatch => isMatch(relativePath) || isMatch(withSlash),
    )
  }

  async function scan(currentDir: string, relativeDir = ''): Promise<void> {
    if (abortSignal.aborted) {
      throw abortSignal.reason ?? new Error('Glob aborted')
    }

    const entries = await fs.readdir(currentDir)
    await Promise.all(
      entries.map(async entry => {
        if (!entry.isDirectory()) {
          return
        }

        const absolutePath = join(currentDir, entry.name)
        const relativePath = relativeDir
          ? `${relativeDir}/${entry.name}`
          : entry.name
        const relativePathWithSlash = `${relativePath}/`

        if (shouldIgnore(relativePath) || shouldIgnore(relativePathWithSlash)) {
          return
        }

        if (matcher(relativePathWithSlash)) {
          const stats = await fs.stat(absolutePath)
          matches.push({ path: absolutePath, mtimeMs: stats.mtimeMs })
        }

        const depth = relativePath.split('/').filter(Boolean).length
        if (depth < maxDepth) {
          await scan(absolutePath, relativePath)
        }
      }),
    )
  }

  await scan(searchDir)

  matches.sort(
    (a, b) => a.mtimeMs - b.mtimeMs || a.path.localeCompare(b.path),
  )
  return matches.map(match => match.path)
}

export async function glob(
  filePattern: string,
  cwd: string,
  { limit, offset }: { limit: number; offset: number },
  abortSignal: AbortSignal,
  toolPermissionContext: ToolPermissionContext,
): Promise<{ files: string[]; truncated: boolean }> {
  let searchDir = cwd
  let searchPattern = filePattern

  // Narrow the search root for both absolute and relative patterns.
  // ripgrep's --glob flag only matches paths relative to the search dir.
  const { baseDir, relativePattern } = extractGlobBaseDirectory(filePattern)
  if (baseDir) {
    searchDir = isAbsolute(baseDir) ? baseDir : join(cwd, baseDir)
    searchPattern = relativePattern
  } else if (isAbsolute(filePattern)) {
    searchDir = dirname(filePattern)
    searchPattern = basename(filePattern)
  }

  const ignorePatterns = normalizePatternsToPath(
    getFileReadIgnorePatterns(toolPermissionContext),
    searchDir,
  )
  const pluginExclusions = await getGlobExclusionsForPluginCache(searchDir)

  let allPaths: string[]
  if (
    isDirectoryGlobPattern(filePattern) ||
    (await isExactDirectoryPattern(searchPattern, searchDir))
  ) {
    allPaths = await globDirectories(
      searchPattern.endsWith('/') ? searchPattern : `${searchPattern}/`,
      searchDir,
      [...ignorePatterns, ...pluginExclusions],
      abortSignal,
    )
  } else {
    if (isRecursiveLiteralDirectoryNamePattern(searchPattern)) {
      const directoryMatches = await globDirectories(
        `${searchPattern}/`,
        searchDir,
        [...ignorePatterns, ...pluginExclusions],
        abortSignal,
      )
      if (directoryMatches.length > 0) {
        const truncated = directoryMatches.length > offset + limit
        const files = directoryMatches.slice(offset, offset + limit)
        return { files, truncated }
      }
    }

    // Use ripgrep for better memory performance
    // --files: list files instead of searching content
    // --sort=modified: sort by modification time (oldest first)
    // --no-ignore: don't respect .gitignore (default false; set CLAUDE_CODE_GLOB_NO_IGNORE=true to include ignored files)
    // --hidden: include hidden files (default true, set CLAUDE_CODE_GLOB_HIDDEN=false to exclude)
    // Note: use || instead of ?? to treat empty string as unset.
    const noIgnore = isEnvTruthy(
      process.env.CLAUDE_CODE_GLOB_NO_IGNORE || 'false',
    )
    const hidden = isEnvTruthy(process.env.CLAUDE_CODE_GLOB_HIDDEN || 'true')
    const args = buildFileGlobRipgrepArgs({
      ignorePatterns,
      pluginExclusions,
      noIgnore,
      hidden,
    })

    const matcher = picomatch(normalizeGlobPattern(searchPattern), {
      dot: true,
      nocase: getPlatform() === 'windows',
    })
    const matchedPaths = (await ripGrep(args, searchDir, abortSignal))
      .filter(path => {
        const relativePath = isAbsolute(path) ? relative(searchDir, path) : path
        return matcher(normalizeGlobPattern(relativePath))
      })
      // ripgrep returns relative paths, convert to absolute before stat/sort.
      .map(path => (isAbsolute(path) ? path : join(searchDir, path)))

    allPaths = await sortFileMatchesByModifiedTime(matchedPaths, abortSignal)
  }

  const truncated = allPaths.length > offset + limit
  const files = allPaths.slice(offset, offset + limit)

  return { files, truncated }
}
