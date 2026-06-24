import { afterEach, describe, expect, it } from 'bun:test'
import {
  notifyCommandLifecycle,
  setCommandLifecycleListener,
} from './commandLifecycle.js'

afterEach(() => {
  setCommandLifecycleListener(null)
})

describe('commandLifecycle', () => {
  it('replaces and clears listeners without retaining stale callbacks', () => {
    const first: Array<[string, 'started' | 'completed']> = []
    const second: Array<[string, 'started' | 'completed']> = []

    setCommandLifecycleListener((uuid, state) => {
      first.push([uuid, state])
    })
    setCommandLifecycleListener((uuid, state) => {
      second.push([uuid, state])
    })

    notifyCommandLifecycle('cmd-2', 'started')
    setCommandLifecycleListener(null)
    notifyCommandLifecycle('cmd-2', 'completed')

    expect(first).toEqual([])
    expect(second).toEqual([['cmd-2', 'started']])
  })
})
