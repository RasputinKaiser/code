import type { SessionLifecycle } from './sessionLifecycle.js'

export type StartupPrefetchPolicyItem = {
  id: string
  applicableTo: readonly SessionLifecycle[]
}

/**
 * Every startup prefetch declares which session lifecycle modes it serves.
 *
 * Adding a new prefetch requires declaring its applicability — making
 * the mode-gating explicit and reviewable. This table is the single
 * source of truth for what runs during startup.
 *
 * Remote/teleport/assistant/ssh/direct-connect sessions delegate their
 * canonical REPL to a remote worker; local cache-warms are irrelevant.
 */
export const STARTUP_PREFETCHES: readonly StartupPrefetchPolicyItem[] = [
  { id: 'quota', applicableTo: ['local_interactive', 'noninteractive'] },
  { id: 'passes', applicableTo: ['local_interactive', 'noninteractive'] },
  { id: 'bootstrap', applicableTo: ['local_interactive'] },
  { id: 'fastMode', applicableTo: ['local_interactive'] },
  { id: 'exampleCommands', applicableTo: ['local_interactive'] },
  // Local interactive REPL only: these warm caches for a TUI that the
  // user actually sees. Noninteractive modes and remote sessions skip them.
]

export function getApplicablePrefetchIds(
  lifecycle: SessionLifecycle,
): readonly string[] {
  return STARTUP_PREFETCHES
    .filter(item => item.applicableTo.includes(lifecycle))
    .map(item => item.id)
}

export function shouldRunStartupPrefetch(
  lifecycle: SessionLifecycle,
  prefetchId: string,
): boolean {
  return STARTUP_PREFETCHES.some(
    item => item.id === prefetchId && item.applicableTo.includes(lifecycle),
  )
}
