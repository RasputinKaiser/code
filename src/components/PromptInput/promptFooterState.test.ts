import { describe, expect, it } from 'bun:test'
import {
  deriveFooterItems,
  getVisibleFooterSelection,
  navigateFooterSelection,
} from './promptFooterState.js'

describe('promptFooterState', () => {
  it('derives footer items in navigation order', () => {
    expect(
      deriveFooterItems({
        tasks: true,
        tmux: false,
        bagel: true,
        teams: true,
        bridge: false,
        companion: true,
      }),
    ).toEqual(['tasks', 'bagel', 'teams', 'companion'])
  })

  it('drops stale selections when the pill is no longer visible', () => {
    expect(
      getVisibleFooterSelection('bridge', ['tasks', 'tmux', 'teams']),
    ).toBeNull()
    expect(
      getVisibleFooterSelection('tmux', ['tasks', 'tmux', 'teams']),
    ).toBe('tmux')
  })

  it('navigates forward, backward, and exits cleanly at the start boundary', () => {
    expect(
      navigateFooterSelection(['tasks', 'tmux', 'teams'], null, 1),
    ).toEqual({
      handled: true,
      nextSelection: 'tasks',
    })

    expect(
      navigateFooterSelection(['tasks', 'tmux', 'teams'], 'tmux', 1),
    ).toEqual({
      handled: true,
      nextSelection: 'teams',
    })

    expect(
      navigateFooterSelection(['tasks', 'tmux', 'teams'], 'tasks', -1, true),
    ).toEqual({
      handled: true,
      nextSelection: null,
    })

    expect(
      navigateFooterSelection(['tasks', 'tmux', 'teams'], 'teams', 1),
    ).toEqual({
      handled: false,
      nextSelection: 'teams',
    })
  })
})
