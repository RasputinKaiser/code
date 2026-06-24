import { existsSync } from 'fs'
import { dirname, join, posix, resolve, win32 } from 'path'

/**
 * Detects if the current runtime is Bun.
 * Returns true when:
 * - Running a JS file via the `bun` command
 * - Running a Bun-compiled standalone executable
 */
export function isRunningWithBun(): boolean {
  // https://bun.com/guides/util/detect-bun
  return process.versions.bun !== undefined
}

/**
 * Detects if running as a Bun-compiled standalone executable.
 * This checks for embedded files which are present in compiled binaries.
 */
export function isInBundledMode(): boolean {
  return (
    typeof Bun !== 'undefined' &&
    Array.isArray(Bun.embeddedFiles) &&
    Bun.embeddedFiles.length > 0
  )
}

function normalizeRuntimePath(path: string): string {
  return process.platform === 'win32'
    ? path.split(win32.sep).join(posix.sep)
    : path
}

export function isRunningFromBuildDirectory(): boolean {
  const invokedPath = normalizeRuntimePath(process.argv[1] || '')
  const execPath = normalizeRuntimePath(process.execPath || process.argv[0] || '')
  const pathsToCheck = [invokedPath, execPath]
  const buildDirs = [
    '/build-ant/',
    '/build-external/',
    '/build-external-native/',
    '/build-ant-native/',
  ]
  return pathsToCheck.some(path => buildDirs.some(dir => path.includes(dir)))
}

export function isRunningFromSourceBuild(): boolean {
  const invokedPath = process.argv[1] || ''
  const normalizedInvokedPath = normalizeRuntimePath(invokedPath)
  if (!normalizedInvokedPath.endsWith('/dist/cli.js')) {
    return false
  }

  try {
    const repoRoot = resolve(dirname(invokedPath), '..')
    return (
      existsSync(join(repoRoot, 'src', 'entrypoints', 'cli.tsx')) &&
      existsSync(join(repoRoot, 'build', 'build.mjs'))
    )
  } catch {
    return false
  }
}

export function isDevelopmentLikeBuild(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    isRunningFromBuildDirectory() ||
    isRunningFromSourceBuild()
  )
}
