import { useSyncExternalStore } from 'react'
import { recordLivePromptTrace } from '../utils/livePromptTrace.js'

type PromptDraftListener = () => void

export type PromptDraftControllerOptions = {
  tryIntercept: (prevValue: string, nextValue: string) => boolean
  repinScroll: () => void
  shouldRepinScroll?: () => boolean
  getLastUserScrollTs: () => number
  recentScrollRepinWindowMs: number
  setPromptInputActive: (active: boolean) => void
  promptSuppressionMs: number
}

export type PromptDraftController = {
  destroy: () => void
  getValue: () => string
  setOptions: (options: PromptDraftControllerOptions) => void
  setValue: (value: string) => void
  subscribe: (listener: PromptDraftListener) => () => void
}

const noopSubscribe = () => () => {}

export function createPromptDraftController(
  initialValue: string,
  initialOptions: PromptDraftControllerOptions,
): PromptDraftController {
  let value = initialValue
  let options = initialOptions
  let suppressionTimer: ReturnType<typeof setTimeout> | null = null
  const listeners = new Set<PromptDraftListener>()

  const clearSuppressionTimer = () => {
    if (suppressionTimer !== null) {
      clearTimeout(suppressionTimer)
      suppressionTimer = null
    }
  }

  const notify = () => {
    for (const listener of listeners) {
      listener()
    }
  }

  const setPromptSuppression = (nextValue: string) => {
    const hasPromptText = nextValue.trim().length > 0
    options.setPromptInputActive(hasPromptText)
    clearSuppressionTimer()
    if (!hasPromptText) {
      return
    }
    suppressionTimer = setTimeout(() => {
      options.setPromptInputActive(false)
      suppressionTimer = null
    }, options.promptSuppressionMs)
  }

  return {
    destroy: () => {
      clearSuppressionTimer()
      listeners.clear()
    },
    getValue: () => value,
    setOptions: nextOptions => {
      options = nextOptions
    },
    setValue: nextValue => {
      const prevValue = value
      if (options.tryIntercept(prevValue, nextValue)) {
        return
      }

      if (
        prevValue === '' &&
        nextValue !== '' &&
        (options.shouldRepinScroll?.() ?? true) &&
        Date.now() - options.getLastUserScrollTs() >=
          options.recentScrollRepinWindowMs
      ) {
        options.repinScroll()
      }

      value = nextValue
      recordLivePromptTrace('prompt-draft-set', {
        prevLength: prevValue.length,
        nextLength: nextValue.length,
        firstTypedChar: prevValue === '' && nextValue !== '',
      })
      setPromptSuppression(nextValue)
      notify()
    },
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export function usePromptDraftValue(
  controller: PromptDraftController,
  enabled = true,
): string {
  return useSyncExternalStore(
    enabled ? controller.subscribe : noopSubscribe,
    controller.getValue,
    controller.getValue,
  )
}
