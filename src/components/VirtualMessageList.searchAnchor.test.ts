import { describe, expect, it } from 'bun:test'
import { findNearestSearchMatchPointer } from './messages/virtualMessageListSearchState.js'

describe('findNearestSearchMatchPointer', () => {
  it('chooses the closest match and breaks ties toward the later match', () => {
    expect(
      findNearestSearchMatchPointer({
        matches: [1, 3, 5, 7],
        offsets: [0, 10, 20, 30, 40, 50, 60, 70],
        origin: 5,
        targetTop: 39,
      }),
    ).toBe(1)

    expect(
      findNearestSearchMatchPointer({
        matches: [1, 3, 5, 7],
        offsets: [0, 10, 20, 30, 40, 50, 60, 70],
        origin: 5,
        targetTop: 45,
      }),
    ).toBe(2)
  })

  it('clamps to the first or last match when the anchor is outside the range', () => {
    expect(
      findNearestSearchMatchPointer({
        matches: [2, 4, 8],
        offsets: [0, 5, 10, 15, 20, 25, 30, 35, 40],
        origin: 0,
        targetTop: -100,
      }),
    ).toBe(0)

    expect(
      findNearestSearchMatchPointer({
        matches: [2, 4, 8],
        offsets: [0, 5, 10, 15, 20, 25, 30, 35, 40],
        origin: 0,
        targetTop: 1000,
      }),
    ).toBe(2)
  })

  it('matches the previous linear rule across representative anchor positions', () => {
    const matches = [0, 2, 5, 9, 12, 15]
    const offsets = [0, 5, 12, 20, 27, 35, 41, 48, 56, 65, 73, 82, 91, 101, 112, 124]
    const origin = 7

    const findNearestSearchMatchPointerLinear = (targetTop: number): number => {
      let ptr = 0
      let best = Infinity
      for (let k = 0; k < matches.length; k += 1) {
        const distance = Math.abs(origin + offsets[matches[k]!]! - targetTop)
        if (distance <= best) {
          best = distance
          ptr = k
        }
      }
      return ptr
    }

    for (const targetTop of [-25, 0, 6, 7, 11, 19, 42, 70, 96, 140, 200]) {
      expect(
        findNearestSearchMatchPointer({
          matches,
          offsets,
          origin,
          targetTop,
        }),
      ).toBe(findNearestSearchMatchPointerLinear(targetTop))
    }
  })
})
