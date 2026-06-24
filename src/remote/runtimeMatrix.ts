import type {
  RemoteSessionProviderMode,
  RemoteSessionRuntime,
  RemoteSessionRuntimeKind,
  RemoteSessionTokenTransport,
} from '../utils/teleport/api.js'

export type RemoteSessionMode =
  | 'remoteSession'
  | 'remoteBYOKSession'
  | 'remoteAppServerSession'
  | 'remoteAppServerBYOKSession'

export type RemoteRuntimeDefinition = {
  mode: RemoteSessionMode
  runtime: RemoteSessionRuntime
}

export const REMOTE_RUNTIME_KIND_NCODE: RemoteSessionRuntimeKind =
  'ncode_remote'
export const REMOTE_RUNTIME_KIND_CODEX_APP_SERVER: RemoteSessionRuntimeKind =
  'codex_app_server'
export const REMOTE_PROVIDER_NOUMENA_MANAGED: RemoteSessionProviderMode =
  'noumena_managed'
export const REMOTE_PROVIDER_BYOK_ANTHROPIC: RemoteSessionProviderMode = 'byok'
export const REMOTE_PROVIDER_BYOK_OPENAI: RemoteSessionProviderMode =
  'byok_openai'
export const REMOTE_TOKEN_LEGACY_OAUTH_ENV: RemoteSessionTokenTransport =
  'legacy_oauth_env'
export const REMOTE_TOKEN_STATIC_API_KEY_ENV: RemoteSessionTokenTransport =
  'static_api_key_env'

export const REMOTE_RUNTIME_MATRIX: Record<
  RemoteSessionMode,
  RemoteRuntimeDefinition
> = {
  remoteSession: {
    mode: 'remoteSession',
    runtime: {
      kind: REMOTE_RUNTIME_KIND_NCODE,
      provider_mode: REMOTE_PROVIDER_NOUMENA_MANAGED,
      token_transport: REMOTE_TOKEN_LEGACY_OAUTH_ENV,
    },
  },
  remoteBYOKSession: {
    mode: 'remoteBYOKSession',
    runtime: {
      kind: REMOTE_RUNTIME_KIND_NCODE,
      provider_mode: REMOTE_PROVIDER_BYOK_ANTHROPIC,
      token_transport: REMOTE_TOKEN_STATIC_API_KEY_ENV,
    },
  },
  remoteAppServerSession: {
    mode: 'remoteAppServerSession',
    runtime: {
      kind: REMOTE_RUNTIME_KIND_CODEX_APP_SERVER,
      provider_mode: REMOTE_PROVIDER_NOUMENA_MANAGED,
      token_transport: REMOTE_TOKEN_LEGACY_OAUTH_ENV,
    },
  },
  remoteAppServerBYOKSession: {
    mode: 'remoteAppServerBYOKSession',
    runtime: {
      kind: REMOTE_RUNTIME_KIND_CODEX_APP_SERVER,
      provider_mode: REMOTE_PROVIDER_BYOK_OPENAI,
      token_transport: REMOTE_TOKEN_STATIC_API_KEY_ENV,
    },
  },
}

export function remoteRuntimeEnvironmentVariables(
  runtime: RemoteSessionRuntime,
): Record<string, string> {
  return {
    NCODE_REMOTE_RUNTIME_KIND: runtime.kind,
    NCODE_REMOTE_RUNTIME_PROVIDER_MODE: runtime.provider_mode,
    ...(runtime.token_transport
      ? { NCODE_REMOTE_RUNTIME_TOKEN_TRANSPORT: runtime.token_transport }
      : {}),
  }
}
