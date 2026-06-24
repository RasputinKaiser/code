import { describe, expect, it } from 'bun:test'
import { createPromptDraftController } from './promptDraftController.js'

describe('promptDraftController', () => {
  it('repins only on empty-to-non-empty transitions outside the recent-scroll window', () => {
    let repinCalls = 0
    const activeStates: boolean[] = []
    const snapshots: string[] = []

    const controller = createPromptDraftController('', {
      tryIntercept: () => false,
      repinScroll: () => {
        repinCalls += 1
      },
      getLastUserScrollTs: () => 0,
      recentScrollRepinWindowMs: 3000,
      setPromptInputActive: active => {
        activeStates.push(active)
      },
      promptSuppressionMs: 20,
    })

    const unsubscribe = controller.subscribe(() => {
      snapshots.push(controller.getValue())
    })

    controller.setValue('hello')
    controller.setValue('hello again')

    unsubscribe()

    expect(repinCalls).toBe(1)
    expect(snapshots).toEqual(['hello', 'hello again'])
    expect(activeStates[0]).toBe(true)
  })

  it('skips repin inside the recent-scroll window and clears prompt suppression after the timeout', async () => {
    const activeStates: boolean[] = []
    const lastScrollTs = Date.now()
    const controller = createPromptDraftController('', {
      tryIntercept: () => false,
      repinScroll: () => {
        throw new Error('repin should not fire inside the recent-scroll window')
      },
      getLastUserScrollTs: () => lastScrollTs,
      recentScrollRepinWindowMs: 3_000,
      setPromptInputActive: active => {
        activeStates.push(active)
      },
      promptSuppressionMs: 20,
    })

    controller.setValue('draft')

    expect(controller.getValue()).toBe('draft')
    expect(activeStates).toEqual([true])

    await Bun.sleep(10)
    expect(activeStates).toEqual([true])

    await Bun.sleep(20)
    expect(activeStates).toEqual([true, false])
  })

  it('skips repin on empty-to-non-empty transitions when already live', () => {
    let repinCalls = 0
    const controller = createPromptDraftController('', {
      tryIntercept: () => false,
      repinScroll: () => {
        repinCalls += 1
      },
      shouldRepinScroll: () => false,
      getLastUserScrollTs: () => 0,
      recentScrollRepinWindowMs: 3_000,
      setPromptInputActive: () => {},
      promptSuppressionMs: 20,
    })

    controller.setValue('h')

    expect(controller.getValue()).toBe('h')
    expect(repinCalls).toBe(0)
  })

  it('cancels pending suppression when the draft is cleared before the timeout', async () => {
    const activeStates: boolean[] = []
    const controller = createPromptDraftController('', {
      tryIntercept: () => false,
      repinScroll: () => {},
      getLastUserScrollTs: () => 0,
      recentScrollRepinWindowMs: 3_000,
      setPromptInputActive: active => {
        activeStates.push(active)
      },
      promptSuppressionMs: 20,
    })

    controller.setValue('draft')
    controller.setValue('')

    await Bun.sleep(30)

    expect(activeStates).toEqual([true, false])
  })

  it('respects interceptors and leaves the stored draft untouched when they claim the transition', () => {
    let subscriberCalls = 0
    const controller = createPromptDraftController('existing', {
      tryIntercept: (prevValue, nextValue) =>
        prevValue === 'existing' && nextValue === 'blocked',
      repinScroll: () => {
        throw new Error('repin should not fire when the transition is intercepted')
      },
      getLastUserScrollTs: () => 0,
      recentScrollRepinWindowMs: 3_000,
      setPromptInputActive: () => {
        throw new Error(
          'prompt suppression should not run when the transition is intercepted',
        )
      },
      promptSuppressionMs: 20,
    })

    controller.subscribe(() => {
      subscriberCalls += 1
    })

    controller.setValue('blocked')

    expect(controller.getValue()).toBe('existing')
    expect(subscriberCalls).toBe(0)
  })
})
