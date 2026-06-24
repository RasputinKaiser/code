export type SessionLifecycle =
  | 'local_interactive'
  | 'noninteractive'
  | 'remote'
  | 'teleport'
  | 'assistant'
  | 'ssh_remote'
  | 'direct_connect'

export interface SessionLifecycleInput {
  sdkUrl?: string
  print?: boolean
  inputFormat?: string
  outputFormat?: string
  remote: string | null
  teleport: string | true | null
  hasPendingConnect: boolean
  hasPendingSSH: boolean
  hasPendingAssistant: boolean
}

const REMOTE_LIKE_LIFECYCLES: ReadonlySet<SessionLifecycle> = new Set([
  'remote',
  'teleport',
  'ssh_remote',
  'direct_connect',
  'assistant',
])

export function isRemoteLikeLifecycle(
  lifecycle: SessionLifecycle,
): boolean {
  return REMOTE_LIKE_LIFECYCLES.has(lifecycle)
}

export function determineSessionLifecycle(
  params: SessionLifecycleInput,
): SessionLifecycle {
  // SDK / headless / print modes are non-interactive inference.
  // They run locally but without a TUI and should skip TUI-specific
  // prefetches (bootstrap model options, fast mode, example commands).
  if (
    params.sdkUrl ||
    params.print ||
    (params.inputFormat === 'stream-json' && params.outputFormat === 'stream-json')
  ) {
    return 'noninteractive'
  }

  // Feature-gated connection modes take precedence over local REPL.
  if (params.hasPendingSSH) {
    return 'ssh_remote'
  }
  if (params.hasPendingConnect) {
    return 'direct_connect'
  }
  if (params.hasPendingAssistant) {
    return 'assistant'
  }

  // Explicit remote-session verbs.
  if (params.remote !== null) {
    return 'remote'
  }
  if (params.teleport !== null) {
    return 'teleport'
  }

  // Everything else is a local interactive session (continue, resume, etc).
  return 'local_interactive'
}
