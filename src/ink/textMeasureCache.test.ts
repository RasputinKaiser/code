import { describe, expect, it } from 'bun:test'
import measureText, {
  getMeasureTextCacheStatsForTesting,
  resetMeasureTextCacheForTesting,
} from './measure-text.js'

describe('text measurement cache', () => {
  it('caches repeated measurement results without changing dimensions', () => {
    resetMeasureTextCacheForTesting()
    const text = 'alpha beta gamma\nsecond line'

    expect(measureText(text, 12)).toEqual({ width: 16, height: 3 })
    expect(measureText(text, 12)).toEqual({ width: 16, height: 3 })
    expect(getMeasureTextCacheStatsForTesting().entries).toBe(1)
  })

  it('does not retain very large measurement inputs', () => {
    resetMeasureTextCacheForTesting()
    measureText('x'.repeat(70 * 1024), 80)

    expect(getMeasureTextCacheStatsForTesting()).toEqual({
      entries: 0,
      bytes: 0,
    })
  })

})
