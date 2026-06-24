type ProactiveListener = () => void

let proactiveActive = false
let proactivePaused = false
let contextBlocked = false
let nextTickAt: number | null = null

const listeners = new Set<ProactiveListener>()

function emitChange(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function isProactiveActive(): boolean {
  return proactiveActive
}

export function activateProactive(_reason?: string): void {
  proactiveActive = true
  proactivePaused = false
  nextTickAt = null
  emitChange()
}

export function deactivateProactive(): void {
  proactiveActive = false
  proactivePaused = false
  nextTickAt = null
  emitChange()
}

export function pauseProactive(): void {
  proactivePaused = true
  emitChange()
}

export function resumeProactive(): void {
  if (!proactiveActive) {
    return
  }
  proactivePaused = false
  emitChange()
}

export function isProactivePaused(): boolean {
  return proactivePaused
}

export function subscribeToProactiveChanges(
  listener: ProactiveListener,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setContextBlocked(blocked: boolean): void {
  contextBlocked = blocked
  if (contextBlocked) {
    nextTickAt = null
  }
  emitChange()
}

export function getNextTickAt(): number | null {
  return nextTickAt
}
