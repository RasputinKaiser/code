import { feature } from 'bun:bundle'

const EPHEMERAL_PROGRESS_TYPES = new Set([
  'bash_progress',
  'powershell_progress',
  'mcp_progress',
  ...(feature('PROACTIVE') || feature('KAIROS')
    ? (['sleep_progress'] as const)
    : []),
])

export function isEphemeralToolProgress(dataType: unknown): boolean {
  return typeof dataType === 'string' && EPHEMERAL_PROGRESS_TYPES.has(dataType)
}
