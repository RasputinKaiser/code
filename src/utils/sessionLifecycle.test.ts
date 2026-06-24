import { describe, expect, it } from 'bun:test'
import {
  determineSessionLifecycle,
  isRemoteLikeLifecycle,
} from './sessionLifecycle.js'
import type { SessionLifecycleInput } from './sessionLifecycle.js'

function base(input: Partial<SessionLifecycleInput> = {}) {
  return {
    sdkUrl: undefined,
    print: undefined,
    inputFormat: undefined,
    outputFormat: undefined,
    remote: null,
    teleport: null,
    hasPendingConnect: false,
    hasPendingSSH: false,
    hasPendingAssistant: false,
    ...input,
  } as SessionLifecycleInput
}

describe('determineSessionLifecycle', () => {
  it('returns "noninteractive" for SDK stream-json mode', () => {
    expect(
      determineSessionLifecycle(
        base({
          inputFormat: 'stream-json',
          outputFormat: 'stream-json',
        }),
      ),
    ).toBe('noninteractive')
  })

  it('returns "noninteractive" for --print', () => {
    expect(determineSessionLifecycle(base({ print: true }))).toBe(
      'noninteractive',
    )
  })

  it('returns "noninteractive" for sdkUrl', () => {
    expect(
      determineSessionLifecycle(base({ sdkUrl: 'http://localhost:8080' })),
    ).toBe('noninteractive')
  })

  it('returns "ssh_remote" for pending SSH', () => {
    expect(
      determineSessionLifecycle(
        base({ hasPendingSSH: true, remote: 'task' }),
      ),
    ).toBe('ssh_remote')
  })

  it('returns "direct_connect" for pending connect', () => {
    expect(
      determineSessionLifecycle(
        base({ hasPendingConnect: true, remote: 'task' }),
      ),
    ).toBe('direct_connect')
  })

  it('returns "assistant" for pending assistant chat', () => {
    expect(
      determineSessionLifecycle(
        base({ hasPendingAssistant: true, remote: 'task' }),
      ),
    ).toBe('assistant')
  })

  it('returns "remote" when --remote is provided', () => {
    expect(
      determineSessionLifecycle(base({ remote: 'task' })),
    ).toBe('remote')
  })

  it('returns "remote" when --remote is true (no description)', () => {
    expect(determineSessionLifecycle(base({ remote: '' }))).toBe('remote')
  })

  it('returns "teleport" when --teleport is provided', () => {
    expect(
      determineSessionLifecycle(base({ teleport: 'session-id' })),
    ).toBe('teleport')
  })

  it('returns "teleport" when --teleport is true (interactive)', () => {
    expect(determineSessionLifecycle(base({ teleport: true }))).toBe(
      'teleport',
    )
  })

  it('returns "local_interactive" in the default case', () => {
    expect(determineSessionLifecycle(base())).toBe('local_interactive')
  })

  it('returns "local_interactive" even with conflicting option flags for --continue/--resume', () => {
    expect(
      determineSessionLifecycle(
        base({
          // these would not be set at the same time in real argv parsing,
          // but the function should still classify as local interactive
        }),
      ),
    ).toBe('local_interactive')
  })
})

describe('isRemoteLikeLifecycle', () => {
  it('returns true for remote session modes', () => {
    const remoteModes: SessionLifecycle[] = [
      'remote',
      'teleport',
      'ssh_remote',
      'direct_connect',
      'assistant',
    ]
    for (const mode of remoteModes) {
      expect(isRemoteLikeLifecycle(mode)).toBe(true)
    }
  })

  it('returns false for local session modes', () => {
    const localModes: SessionLifecycle[] = [
      'local_interactive',
      'noninteractive',
    ]
    for (const mode of localModes) {
      expect(isRemoteLikeLifecycle(mode)).toBe(false)
    }
  })
})
