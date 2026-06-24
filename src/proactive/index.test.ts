import { beforeEach, describe, expect, test } from 'bun:test'
import {
  activateProactive,
  deactivateProactive,
  isProactivePaused,
  pauseProactive,
  resumeProactive,
} from './index.js'

describe('proactive resume', () => {
  beforeEach(() => {
    deactivateProactive()
  })

  test('resumeProactive unpauses an active proactive session', () => {
    activateProactive('test')
    pauseProactive()
    expect(isProactivePaused()).toBe(true)

    resumeProactive()

    expect(isProactivePaused()).toBe(false)
  })

  test('resumeProactive is a no-op when proactive is inactive', () => {
    pauseProactive()
    expect(isProactivePaused()).toBe(true)

    resumeProactive()

    expect(isProactivePaused()).toBe(true)
  })
})
