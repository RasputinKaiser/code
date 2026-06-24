import { describe, expect, test } from 'bun:test'

import {
  REMOTE_RUNTIME_MATRIX,
  remoteRuntimeEnvironmentVariables,
} from './runtimeMatrix.js'

describe('remote runtime matrix', () => {
  test('defines the four first-class remote modes', () => {
    expect(Object.keys(REMOTE_RUNTIME_MATRIX).sort()).toEqual([
      'remoteAppServerBYOKSession',
      'remoteAppServerSession',
      'remoteBYOKSession',
      'remoteSession',
    ])
  })

  test('maps runtime kind and provider mode for each first-class mode', () => {
    expect(REMOTE_RUNTIME_MATRIX.remoteSession.runtime).toEqual({
      kind: 'ncode_remote',
      provider_mode: 'noumena_managed',
      token_transport: 'legacy_oauth_env',
    })
    expect(REMOTE_RUNTIME_MATRIX.remoteBYOKSession.runtime).toEqual({
      kind: 'ncode_remote',
      provider_mode: 'byok',
      token_transport: 'static_api_key_env',
    })
    expect(REMOTE_RUNTIME_MATRIX.remoteAppServerSession.runtime).toEqual({
      kind: 'codex_app_server',
      provider_mode: 'noumena_managed',
      token_transport: 'legacy_oauth_env',
    })
    expect(REMOTE_RUNTIME_MATRIX.remoteAppServerBYOKSession.runtime).toEqual({
      kind: 'codex_app_server',
      provider_mode: 'byok_openai',
      token_transport: 'static_api_key_env',
    })
  })

  test('renders canonical platform worker env vars', () => {
    expect(
      remoteRuntimeEnvironmentVariables(
        REMOTE_RUNTIME_MATRIX.remoteAppServerBYOKSession.runtime,
      ),
    ).toEqual({
      NCODE_REMOTE_RUNTIME_KIND: 'codex_app_server',
      NCODE_REMOTE_RUNTIME_PROVIDER_MODE: 'byok_openai',
      NCODE_REMOTE_RUNTIME_TOKEN_TRANSPORT: 'static_api_key_env',
    })
  })
})
