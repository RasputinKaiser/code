import { describe, expect, it } from 'bun:test'
import {
  addLayoutDamageRect,
  addLayoutDamageRows,
  addLayoutTransitionDamage,
  toFullWidthDamageRect,
} from './layoutDamageRows.js'

describe('layoutDamageRows', () => {
  it('unions moved layout rows across previous and next rectangles', () => {
    const rows = addLayoutTransitionDamage(
      null,
      { y: 10.2, height: 3.1 },
      { y: 15.1, height: 4.6 },
    )

    expect(rows).toEqual({
      y: 10,
      height: 10,
    })
  })

  it('extends an existing row band with later clear spans', () => {
    let rows = addLayoutDamageRows(null, 12, 2)
    rows = addLayoutDamageRect(rows, { y: 20.4, height: 3.2 })

    expect(rows).toEqual({
      y: 12,
      height: 12,
    })
  })

  it('clamps row-band damage to the visible screen when materialized', () => {
    const rect = toFullWidthDamageRect(
      {
        y: -2,
        height: 8,
      },
      120,
      5,
    )

    expect(rect).toEqual({
      x: 0,
      y: 0,
      width: 120,
      height: 5,
    })
  })

  it('ignores empty spans and empty screens', () => {
    expect(addLayoutDamageRows(null, 5, 0)).toBeNull()
    expect(toFullWidthDamageRect({ y: 5, height: 2 }, 120, 0)).toBeNull()
  })
})
