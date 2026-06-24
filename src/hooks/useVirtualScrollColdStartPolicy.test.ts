import { describe, expect, it } from 'bun:test'
import {
  computeVirtualScrollColdStartRange,
  resolveVirtualScrollColdStartCount,
} from './useVirtualScroll.js'

describe('resolveVirtualScrollColdStartCount', () => {
  it('caps the first cold-start mount to the known terminal height when no prior viewport exists', () => {
    expect(
      resolveVirtualScrollColdStartCount({
        previousViewportHeight: 0,
        terminalRows: 24,
      }),
    ).toBe(24)
  })

  it('preserves a minimum slack floor on very short terminals', () => {
    expect(
      resolveVirtualScrollColdStartCount({
        previousViewportHeight: 0,
        terminalRows: 6,
      }),
    ).toBe(12)
  })

  it('still prefers the measured prior viewport when one exists', () => {
    expect(
      resolveVirtualScrollColdStartCount({
        previousViewportHeight: 20,
        terminalRows: 24,
      }),
    ).toBe(26)
  })
})

describe('computeVirtualScrollColdStartRange', () => {
  it('shrinks the cold-start tail when warm measured rows already cover the previous viewport', () => {
    const itemKeys = Array.from({ length: 40 }, (_, index) => `item-${index}`)
    const heights = new Map<string, number>([
      ['item-36', 28],
      ['item-37', 28],
      ['item-38', 28],
      ['item-39', 28],
    ])

    expect(
      computeVirtualScrollColdStartRange({
        itemKeys,
        heightCache: heights,
        previousViewportHeight: 20,
      }),
    ).toEqual([37, 40])
  })

  it('keeps the historical cold-start fallback when no prior viewport is known', () => {
    const itemKeys = Array.from({ length: 40 }, (_, index) => `item-${index}`)

    expect(
      computeVirtualScrollColdStartRange({
        itemKeys,
        heightCache: new Map(),
        previousViewportHeight: 0,
      }),
    ).toEqual([10, 40])
  })

  it('uses terminal rows to shrink the cold-start tail on the first transcript mount', () => {
    const itemKeys = Array.from({ length: 40 }, (_, index) => `item-${index}`)

    expect(
      computeVirtualScrollColdStartRange({
        itemKeys,
        heightCache: new Map(),
        previousViewportHeight: 0,
        terminalRows: 24,
      }),
    ).toEqual([16, 40])
  })

  it('reuses warm tail heights from the prior prompt view on the first transcript mount', () => {
    const itemKeys = Array.from({ length: 40 }, (_, index) => `item-${index}`)
    const warmHeights = new Map<string, number>([
      ['item-36', 28],
      ['item-37', 28],
      ['item-38', 28],
      ['item-39', 28],
    ])

    expect(
      computeVirtualScrollColdStartRange({
        itemKeys,
        heightCache: new Map(),
        getWarmHeight: key => warmHeights.get(key),
        previousViewportHeight: 0,
        terminalRows: 24,
      }),
    ).toEqual([37, 40])
  })

  it('uses estimated tail row heights to avoid over-mounting giant cold-start messages', () => {
    const itemKeys = Array.from({ length: 40 }, (_, index) => `item-${index}`)

    expect(
      computeVirtualScrollColdStartRange({
        itemKeys,
        heightCache: new Map(),
        estimateItemHeight: index => (index >= 36 ? 28 : undefined),
        previousViewportHeight: 0,
        terminalRows: 24,
      }),
    ).toEqual([37, 40])
  })

  it('keeps the historical cold-start fallback when warm tail coverage is incomplete', () => {
    const itemKeys = Array.from({ length: 40 }, (_, index) => `item-${index}`)
    const heights = new Map<string, number>([
      ['item-38', 28],
      ['item-39', 28],
    ])

    expect(
      computeVirtualScrollColdStartRange({
        itemKeys,
        heightCache: heights,
        previousViewportHeight: 20,
      }),
    ).toEqual([14, 40])
  })

  it('does not mount more than the legacy cold-start window when warm coverage would need deeper history', () => {
    const itemKeys = Array.from({ length: 80 }, (_, index) => `item-${index}`)
    const heights = new Map<string, number>(
      Array.from({ length: 30 }, (_, offset) => [`item-${50 + offset}`, 2]),
    )

    expect(
      computeVirtualScrollColdStartRange({
        itemKeys,
        heightCache: heights,
        previousViewportHeight: 40,
      }),
    ).toEqual([50, 80])
  })
})
