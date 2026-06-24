import { describe, expect, it } from 'bun:test'
import { shouldUseRemoteSubmit } from './remoteSubmitPolicy.js'

describe('shouldUseRemoteSubmit', () => {
  it('allows ordinary remote submits', () => {
    expect(
      shouldUseRemoteSubmit({
        isRemoteMode: true,
        isSlashCommand: false,
      }),
    ).toBe(true)
  })

  it('keeps local-jsx slash commands local even in remote mode', () => {
    expect(
      shouldUseRemoteSubmit({
        isRemoteMode: true,
        isSlashCommand: true,
        matchedCommandType: 'local-jsx',
      }),
    ).toBe(false)
  })
})
