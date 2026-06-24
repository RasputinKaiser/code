import { describe, expect, it } from 'bun:test'
import { createCombinedAbortSignal } from './combinedAbortSignal.js'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('createCombinedAbortSignal', () => {
  it('starts aborted when either source signal is already aborted', () => {
    const signalA = AbortSignal.abort()
    const signalB = new AbortController().signal

    const { signal, cleanup } = createCombinedAbortSignal(signalA, {
      signalB,
      timeoutMs: 10,
    })

    expect(signal.aborted).toBe(true)
    cleanup()
  })

  it('aborts when either live input signal aborts', () => {
    const controllerA = new AbortController()
    const controllerB = new AbortController()
    const { signal, cleanup } = createCombinedAbortSignal(controllerA.signal, {
      signalB: controllerB.signal,
    })

    expect(signal.aborted).toBe(false)

    controllerB.abort()

    expect(signal.aborted).toBe(true)
    cleanup()
  })

  it('aborts after the timeout when no input signal fires first', async () => {
    const { signal, cleanup } = createCombinedAbortSignal(undefined, {
      timeoutMs: 10,
    })

    await sleep(25)

    expect(signal.aborted).toBe(true)
    cleanup()
  })

  it('cleanup clears listeners and timers so later aborts do not propagate', async () => {
    const controllerA = new AbortController()
    const controllerB = new AbortController()
    const { signal, cleanup } = createCombinedAbortSignal(controllerA.signal, {
      signalB: controllerB.signal,
      timeoutMs: 10,
    })

    cleanup()
    controllerA.abort()
    controllerB.abort()
    await sleep(25)

    expect(signal.aborted).toBe(false)
  })
})
