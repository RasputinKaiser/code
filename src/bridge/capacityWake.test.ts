import { describe, expect, it } from 'bun:test'
import { createCapacityWake } from './capacityWake.js'

describe('createCapacityWake', () => {
  it('aborts the merged signal when the outer signal aborts and allows safe cleanup', () => {
    const outer = new AbortController()
    const wake = createCapacityWake(outer.signal)

    const { signal, cleanup } = wake.signal()
    expect(signal.aborted).toBe(false)

    outer.abort()
    expect(signal.aborted).toBe(true)

    // cleanup is best-effort listener removal and should stay safe after abort
    expect(() => cleanup()).not.toThrow()
    expect(() => cleanup()).not.toThrow()
  })

  it('wake aborts the current wait and re-arms a fresh wake signal for later waits', () => {
    const outer = new AbortController()
    const wake = createCapacityWake(outer.signal)

    const first = wake.signal()
    expect(first.signal.aborted).toBe(false)

    wake.wake()
    expect(first.signal.aborted).toBe(true)
    first.cleanup()

    const second = wake.signal()
    expect(second.signal.aborted).toBe(false)
    second.cleanup()
  })
})
