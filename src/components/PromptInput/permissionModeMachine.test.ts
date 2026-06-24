import { describe, expect, test } from 'bun:test'

import {
  AutoModeTimeoutRef,
  clearAutoModeOptInTimeout,
  scheduleAutoModeOptInDialog,
} from './permissionModeMachine.js'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

describe('permission mode auto-mode helpers', () => {
  test('scheduleAutoModeOptInDialog triggers the dialog and clears the timer', async () => {
    const ref: AutoModeTimeoutRef = { current: null }
    const calls: boolean[] = []

    scheduleAutoModeOptInDialog(ref, value => calls.push(value), 0)
    expect(ref.current).not.toBeNull()

    await tick()

    expect(calls).toEqual([true])
    expect(ref.current).toBeNull()
  })

  test('clearAutoModeOptInTimeout prevents the dialog from showing', async () => {
    const ref: AutoModeTimeoutRef = { current: null }
    const calls: boolean[] = []

    scheduleAutoModeOptInDialog(ref, value => calls.push(value), 0)
    expect(ref.current).not.toBeNull()

    clearAutoModeOptInTimeout(ref)
    await tick()

    expect(calls).toEqual([])
    expect(ref.current).toBeNull()
  })
})
