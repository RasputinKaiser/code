import { recordLivePromptTrace } from './livePromptTrace.js'

const RENDER_TRACE_KEY = '__NCODE_RENDER_TRACE__'

type RenderTraceStore = Map<string, number>

function getRenderTraceStore(): RenderTraceStore | null {
  const maybeStore = (globalThis as Record<string, unknown>)[RENDER_TRACE_KEY]
  return maybeStore instanceof Map ? (maybeStore as RenderTraceStore) : null
}

export function recordRenderTrace(name: string): void {
  recordLivePromptTrace('render', { name })
  const store = getRenderTraceStore()
  if (!store) return
  store.set(name, (store.get(name) ?? 0) + 1)
}

export function installRenderTrace(): {
  reset: () => void
  snapshot: () => Map<string, number>
  uninstall: () => void
} {
  const store: RenderTraceStore = new Map()
  ;(globalThis as Record<string, unknown>)[RENDER_TRACE_KEY] = store
  return {
    reset: () => store.clear(),
    snapshot: () => new Map(store),
    uninstall: () => {
      delete (globalThis as Record<string, unknown>)[RENDER_TRACE_KEY]
    },
  }
}

export function diffRenderTrace(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
): Record<string, number> {
  const names = new Set([...before.keys(), ...after.keys()])
  const diff: Record<string, number> = {}
  for (const name of names) {
    const delta = (after.get(name) ?? 0) - (before.get(name) ?? 0)
    if (delta !== 0) {
      diff[name] = delta
    }
  }
  return diff
}
