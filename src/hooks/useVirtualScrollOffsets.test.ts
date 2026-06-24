import { describe, expect, it } from 'bun:test'
import {
  computeVirtualScrollOffsets,
  type VirtualScrollOffsetsState,
} from './useVirtualScroll.js'

describe('computeVirtualScrollOffsets', () => {
  it('extends offsets incrementally for append-only growth', () => {
    const previous: VirtualScrollOffsetsState = {
      arr: new Float64Array(8),
      version: 1,
      n: 3,
    }
    previous.arr[0] = 0
    previous.arr[1] = 2
    previous.arr[2] = 5
    previous.arr[3] = 9

    const next = computeVirtualScrollOffsets(
      ['a', 'b', 'c', 'd', 'e'],
      new Map([
        ['a', 2],
        ['b', 3],
        ['c', 4],
        ['d', 1],
        ['e', 5],
      ]),
      previous,
      1,
    )

    expect(Array.from(next.arr.slice(0, 6))).toEqual([0, 2, 5, 9, 10, 15])
    expect(next.version).toBe(1)
    expect(next.n).toBe(5)
  })

  it('returns the previous state when version and length are unchanged', () => {
    const previous: VirtualScrollOffsetsState = {
      arr: new Float64Array([0, 2, 5, 9]),
      version: 2,
      n: 3,
    }

    const next = computeVirtualScrollOffsets(
      ['a', 'b', 'c'],
      new Map([
        ['a', 2],
        ['b', 3],
        ['c', 4],
      ]),
      previous,
      2,
    )

    expect(next).toBe(previous)
  })

  it('rebuilds offsets when the version changes', () => {
    const previous: VirtualScrollOffsetsState = {
      arr: new Float64Array([0, 99, 199, 299]),
      version: 1,
      n: 3,
    }

    const next = computeVirtualScrollOffsets(
      ['a', 'b', 'c'],
      new Map([
        ['a', 2],
        ['b', 3],
        ['c', 4],
      ]),
      previous,
      2,
    )

    expect(Array.from(next.arr.slice(0, 4))).toEqual([0, 2, 5, 9])
    expect(next.version).toBe(2)
    expect(next.n).toBe(3)
  })
})
