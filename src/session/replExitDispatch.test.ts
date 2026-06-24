import { describe, expect, test } from 'bun:test'
import { dispatchReplExit } from './replExitDispatch.js'

describe('dispatchReplExit', () => {
  test('detaches background tmux sessions instead of loading exit flow', async () => {
    const events: string[] = []

    await dispatchReplExit(
      {
        bgSessionsEnabled: true,
        bgSessionActive: true,
        hasCurrentWorktree: false,
      },
      {
        setIsExiting: value => {
          events.push(`setIsExiting:${value}`)
        },
        detachTmuxClient: () => {
          events.push('detach')
        },
        createWorktreeExitFlow: () => {
          throw new Error('should not create worktree exit flow')
        },
        clearExitFlow: () => {
          throw new Error('should not clear exit flow')
        },
        setExitFlow: () => {
          throw new Error('should not set exit flow')
        },
        loadExitModule: async () => {
          throw new Error('should not load exit module')
        },
      },
    )

    expect(events).toEqual(['setIsExiting:true', 'detach', 'setIsExiting:false'])
  })

  test('shows worktree exit flow when a worktree session is active', async () => {
    let cancel: (() => void) | null = null
    const events: string[] = []

    await dispatchReplExit(
      {
        bgSessionsEnabled: true,
        bgSessionActive: false,
        hasCurrentWorktree: true,
      },
      {
        setIsExiting: value => {
          events.push(`setIsExiting:${value}`)
        },
        detachTmuxClient: () => {
          throw new Error('should not detach')
        },
        createWorktreeExitFlow: params => {
          cancel = params.onCancel
          return 'worktree-exit-flow'
        },
        clearExitFlow: () => {
          events.push('clearExitFlow')
        },
        setExitFlow: value => {
          events.push(`setExitFlow:${String(value)}`)
        },
        loadExitModule: async () => {
          throw new Error('should not load exit module')
        },
      },
    )

    expect(events).toEqual([
      'setIsExiting:true',
      'setExitFlow:worktree-exit-flow',
    ])

    cancel?.()
    expect(events).toEqual([
      'setIsExiting:true',
      'setExitFlow:worktree-exit-flow',
      'clearExitFlow',
      'setIsExiting:false',
    ])
  })

  test('loads exit module for normal sessions and preserves null return reset semantics', async () => {
    const events: string[] = []

    await dispatchReplExit(
      {
        bgSessionsEnabled: true,
        bgSessionActive: false,
        hasCurrentWorktree: false,
      },
      {
        setIsExiting: value => {
          events.push(`setIsExiting:${value}`)
        },
        detachTmuxClient: () => {
          throw new Error('should not detach')
        },
        createWorktreeExitFlow: () => {
          throw new Error('should not create worktree exit flow')
        },
        clearExitFlow: () => {
          throw new Error('should not clear exit flow')
        },
        setExitFlow: value => {
          events.push(`setExitFlow:${String(value)}`)
        },
        loadExitModule: async () => ({
          call: async () => null,
        }),
      },
    )

    expect(events).toEqual([
      'setIsExiting:true',
      'setExitFlow:null',
      'setIsExiting:false',
    ])
  })
})
