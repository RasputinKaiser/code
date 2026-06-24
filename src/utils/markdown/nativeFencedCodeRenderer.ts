import { join } from 'path'
import { createRequire } from 'module'
import { isInBundledMode } from '../bundledMode.js'
import { isEnvTruthy } from '../envUtils.js'

declare const module:
  | {
      require?(id: string): unknown
    }
  | undefined

type GlobalWithRequire = typeof globalThis & {
  require?: (id: string) => unknown
}

type RequireFunction = (id: string) => unknown

type RequireSource = 'global' | 'module' | 'createRequire' | 'none'

type NativeRendererLoadFailure = {
  moduleId: string
  message: string
}

export type NativeFencedCodeRendererDebugSnapshot = {
  requireSource: RequireSource
  moduleIds: ReadonlyArray<string>
  loadAttempts: number
  loadSuccesses: number
  loadFailures: number
  resolvedModuleId: string | null
  lastLoadFailures: ReadonlyArray<NativeRendererLoadFailure>
  renderCalls: number
  renderSuccesses: number
  renderFailures: number
  invalidReturns: number
  lastResultKind: 'lines' | 'invalid-return' | 'threw' | 'no-renderer'
  lastRenderDurationMs: number
  totalRenderDurationMs: number
  maxRenderDurationMs: number
  lastLineCount: number
}

const MODULE_ID = 'markdown-renderer-napi'
const BUNDLED_MODULE_ID = '../../shims/markdownRendererNapi.js'
const NATIVE_FENCED_CODE_ENV_KEYS = [
  'NCODE_ENABLE_NATIVE_FENCED_CODE',
  'CLAUDE_CODE_ENABLE_NATIVE_FENCED_CODE',
] as const
const LOCAL_NATIVE_RENDERER_RELATIVE_PATHS = [
  ['native', 'markdown-renderer-napi'],
  ['code', 'native', 'markdown-renderer-napi'],
] as const

export type NativeFencedCodeRendererLines = ReadonlyArray<string>

export type NativeFencedCodeRendererOptions = {
  language?: string | null
  terminalWidth?: number
}

type NativeFencedCodeRendererFn = (
  code: string,
  options?: NativeFencedCodeRendererOptions,
) => NativeFencedCodeRendererLines

let cachedRendererFn: NativeFencedCodeRendererFn | null | undefined
let cachedRequireFn: RequireFunction | null | undefined
let cachedModuleIds: ReadonlyArray<string> | undefined
let cachedCreateRequireFn: RequireFunction | null | undefined
let debugState: NativeFencedCodeRendererDebugSnapshot = makeInitialDebugState()

function makeInitialDebugState(): NativeFencedCodeRendererDebugSnapshot {
  return {
    requireSource: 'none',
    moduleIds: [],
    loadAttempts: 0,
    loadSuccesses: 0,
    loadFailures: 0,
    resolvedModuleId: null,
    lastLoadFailures: [],
    renderCalls: 0,
    renderSuccesses: 0,
    renderFailures: 0,
    invalidReturns: 0,
    lastResultKind: 'no-renderer',
    lastRenderDurationMs: 0,
    totalRenderDurationMs: 0,
    maxRenderDurationMs: 0,
    lastLineCount: 0,
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function getRequireFunction(): RequireFunction | null {
  if (cachedRequireFn !== undefined) {
    return cachedRequireFn
  }
  const globalWithRequire = globalThis as GlobalWithRequire
  if (typeof globalWithRequire.require === 'function') {
    cachedRequireFn = globalWithRequire.require.bind(globalThis) as RequireFunction
    debugState.requireSource = 'global'
    return cachedRequireFn
  }
  if (typeof module !== 'undefined' && typeof module.require === 'function') {
    cachedRequireFn = module.require.bind(module)
    debugState.requireSource = 'module'
    return cachedRequireFn
  }
  if (cachedCreateRequireFn !== undefined) {
    debugState.requireSource = cachedCreateRequireFn ? 'createRequire' : 'none'
    return cachedCreateRequireFn
  }
  try {
    cachedCreateRequireFn = createRequire(import.meta.url)
    debugState.requireSource = 'createRequire'
    return cachedCreateRequireFn
  } catch {
    cachedCreateRequireFn = null
  }
  debugState.requireSource = 'none'
  cachedRequireFn = null
  return null
}

function resolveRendererFunction(
  value: unknown,
  triedDefault = false,
): NativeFencedCodeRendererFn | null {
  if (typeof value === 'function') {
    return value as NativeFencedCodeRendererFn
  }
  if (value && typeof value === 'object') {
    const moduleObject = value as {
      renderFencedCode?: unknown
      default?: unknown
    }
    if (typeof moduleObject.renderFencedCode === 'function') {
      return moduleObject.renderFencedCode as NativeFencedCodeRendererFn
    }
    if (!triedDefault) {
      const defaultExport = moduleObject.default
      if (defaultExport !== undefined && defaultExport !== value) {
        return resolveRendererFunction(defaultExport, true)
      }
    }
  }
  return null
}

function loadNativeRenderer(): NativeFencedCodeRendererFn | null {
  if (cachedRendererFn !== undefined) {
    return cachedRendererFn
  }
  // The current native fence path is still an experimental performance seam.
  // Until it preserves the existing highlighted ANSI semantics, keep it
  // opt-in so normal markdown/code-fence rendering stays behavior-compatible.
  if (
    !NATIVE_FENCED_CODE_ENV_KEYS.some(key =>
      isEnvTruthy(process.env[key]),
    )
  ) {
    cachedRendererFn = null
    return null
  }
  debugState.loadAttempts += 1
  const requireFn = getRequireFunction()
  if (!requireFn) {
    cachedRendererFn = null
    return null
  }
  const moduleIds = [
    ...(isInBundledMode() ? [BUNDLED_MODULE_ID] : []),
    ...getNativeRendererModuleIds(),
  ]
  debugState.moduleIds = [...moduleIds]
  debugState.resolvedModuleId = null
  const loadFailures: NativeRendererLoadFailure[] = []
  for (const moduleId of moduleIds) {
    try {
      const imported = requireFn(moduleId)
      const rendererFn = resolveRendererFunction(imported)
      if (rendererFn) {
        cachedRendererFn = rendererFn
        debugState.loadSuccesses += 1
        debugState.resolvedModuleId = moduleId
        debugState.lastLoadFailures = loadFailures
        return rendererFn
      }
    } catch {
      // Fail-open by trying the next candidate module id.
      loadFailures.push({
        moduleId,
        message: 'require_failed',
      })
    }
  }
  debugState.loadFailures += 1
  debugState.lastLoadFailures = loadFailures
  cachedRendererFn = null
  return null
}

function isStringArray(value: unknown): value is NativeFencedCodeRendererLines {
  return (
    Array.isArray(value) &&
    value.every(item => typeof item === 'string')
  )
}

export function renderNativeFencedCode(
  code: string,
  options?: NativeFencedCodeRendererOptions,
): NativeFencedCodeRendererLines | null {
  const rendererFn = loadNativeRenderer()
  debugState.renderCalls += 1
  if (!rendererFn) {
    debugState.renderFailures += 1
    debugState.lastResultKind = 'no-renderer'
    return null
  }
  const startMs = nowMs()
  try {
    const normalizedOptions =
      options === undefined ? undefined : { ...options }
    const result = rendererFn(code, normalizedOptions)
    const durationMs = nowMs() - startMs
    debugState.lastRenderDurationMs = durationMs
    debugState.totalRenderDurationMs += durationMs
    debugState.maxRenderDurationMs = Math.max(
      debugState.maxRenderDurationMs,
      durationMs,
    )
    if (!isStringArray(result)) {
      cachedRendererFn = null
      debugState.renderFailures += 1
      debugState.invalidReturns += 1
      debugState.lastResultKind = 'invalid-return'
      debugState.lastLineCount = 0
      return null
    }
    debugState.renderSuccesses += 1
    debugState.lastResultKind = 'lines'
    debugState.lastLineCount = result.length
    return result
  } catch {
    cachedRendererFn = null
    const durationMs = nowMs() - startMs
    debugState.lastRenderDurationMs = durationMs
    debugState.totalRenderDurationMs += durationMs
    debugState.maxRenderDurationMs = Math.max(
      debugState.maxRenderDurationMs,
      durationMs,
    )
    debugState.renderFailures += 1
    debugState.lastResultKind = 'threw'
    debugState.lastLineCount = 0
    return null
  }
}

export function resetNativeFencedCodeRendererCacheForTesting(): void {
  cachedRendererFn = undefined
  cachedRequireFn = undefined
  cachedModuleIds = undefined
  cachedCreateRequireFn = undefined
  debugState = makeInitialDebugState()
}

export function getNativeFencedCodeRendererDebugSnapshot(): NativeFencedCodeRendererDebugSnapshot {
  return {
    ...debugState,
    moduleIds: [...debugState.moduleIds],
    lastLoadFailures: debugState.lastLoadFailures.map(failure => ({ ...failure })),
  }
}

function getNativeRendererModuleIds(): ReadonlyArray<string> {
  if (cachedModuleIds !== undefined) {
    return cachedModuleIds
  }

  const moduleIds = new Set<string>([MODULE_ID])
  const cwd = typeof process.cwd === 'function' ? process.cwd() : null
  if (cwd && cwd.length > 0) {
    for (const segments of LOCAL_NATIVE_RENDERER_RELATIVE_PATHS) {
      moduleIds.add(join(cwd, ...segments))
    }
  }

  cachedModuleIds = Array.from(moduleIds)
  return cachedModuleIds
}
