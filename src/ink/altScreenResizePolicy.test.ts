import { describe, expect, it } from 'bun:test'
import {
  getAltScreenRecoveryRepaintMode,
  getAltScreenResizeRepaintMode,
} from './altScreenResizePolicy.js'

describe('alt-screen resize erase policy', () => {
  it('uses an atomic erase only for width changes on synchronized terminals', () => {
    expect(getAltScreenResizeRepaintMode(120, 100, true)).toBe(
      'erase-before-paint',
    )
    expect(getAltScreenResizeRepaintMode(100, 120, true)).toBe(
      'erase-before-paint',
    )
    expect(getAltScreenResizeRepaintMode(100, 100, true)).toBe('none')
  })

  it('falls back to a row-wise repaint from home on unsupported terminals', () => {
    expect(getAltScreenResizeRepaintMode(120, 100, false)).toBe(
      'repaint-from-home',
    )
    expect(getAltScreenResizeRepaintMode(100, 120, false)).toBe(
      'repaint-from-home',
    )
    expect(getAltScreenResizeRepaintMode(100, 100, false)).toBe('none')
  })

  it('uses the same atomic-vs-rowwise split for alt-screen recovery', () => {
    expect(getAltScreenRecoveryRepaintMode(true)).toBe('erase-before-paint')
    expect(getAltScreenRecoveryRepaintMode(false)).toBe('repaint-from-home')
  })
})
