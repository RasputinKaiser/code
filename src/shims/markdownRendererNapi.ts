import { createRequire } from 'node:module'
import markdownRendererPath from './assets/markdownRenderer.js'

const requireFn = createRequire(import.meta.url)

let cachedBinding:
  | {
      renderFencedCode?: (code: string, options?: unknown) => string[] | null
    }
  | null
  | undefined

function loadNativeBinding() {
  if (cachedBinding !== undefined) {
    return cachedBinding
  }

  try {
    cachedBinding = requireFn(markdownRendererPath) as {
      renderFencedCode?: (code: string, options?: unknown) => string[] | null
    }
  } catch {
    cachedBinding = null
  }

  return cachedBinding
}

export function renderFencedCode(code: string, options?: unknown): string[] | null {
  const binding = loadNativeBinding()
  if (!binding || typeof binding.renderFencedCode !== 'function') {
    return null
  }
  return binding.renderFencedCode(code, options)
}

export default {
  renderFencedCode,
}
