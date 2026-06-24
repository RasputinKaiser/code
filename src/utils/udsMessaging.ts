type OnEnqueue = (() => void) | null

let socketPath: string | null = null
let onEnqueue: OnEnqueue = null

export function getDefaultUdsSocketPath(): string {
  return '/tmp/ncode-uds.sock'
}

export async function startUdsMessaging(path: string): Promise<void> {
  socketPath = path
}

export function getUdsMessagingSocketPath(): string | null {
  return socketPath
}

export function setOnEnqueue(callback: (() => void) | null): void {
  onEnqueue = callback
}

export function triggerUdsEnqueue(): void {
  onEnqueue?.()
}
