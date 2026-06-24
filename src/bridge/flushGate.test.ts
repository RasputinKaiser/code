import { describe, expect, it } from 'bun:test'
import { FlushGate } from './flushGate.js'

describe('FlushGate', () => {
  it('queues only while active and drains queued items on end', () => {
    const gate = new FlushGate<string>()

    expect(gate.enqueue('before-start')).toBe(false)
    expect(gate.pendingCount).toBe(0)
    expect(gate.active).toBe(false)

    gate.start()

    expect(gate.active).toBe(true)
    expect(gate.enqueue('a', 'b')).toBe(true)
    expect(gate.pendingCount).toBe(2)

    expect(gate.end()).toEqual(['a', 'b'])
    expect(gate.active).toBe(false)
    expect(gate.pendingCount).toBe(0)
  })

  it('deactivates without dropping queued items so a replacement transport can drain them', () => {
    const gate = new FlushGate<number>()

    gate.start()
    expect(gate.enqueue(1, 2, 3)).toBe(true)

    gate.deactivate()

    expect(gate.active).toBe(false)
    expect(gate.pendingCount).toBe(3)
    expect(gate.enqueue(4)).toBe(false)
    expect(gate.end()).toEqual([1, 2, 3])
  })

  it('drops queued items and reports how many were discarded', () => {
    const gate = new FlushGate<string>()

    gate.start()
    gate.enqueue('x', 'y')

    expect(gate.drop()).toBe(2)
    expect(gate.active).toBe(false)
    expect(gate.pendingCount).toBe(0)
    expect(gate.end()).toEqual([])
  })
})
