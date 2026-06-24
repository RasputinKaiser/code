import { describe, expect, test } from 'bun:test'

import { getDefaultAppState } from '../state/AppState.js'
import { createUserMessage } from '../utils/messages.js'
import {
  dispatchReplInitialMessage,
  type ReplInitialMessage,
} from './replInitialMessageDispatch.js'

function createInitialMessage(
  overrides: Partial<ReplInitialMessage> & {
    content?: string
    planContent?: string
  } = {},
): ReplInitialMessage {
  const {
    content = 'hello world',
    planContent,
    ...rest
  } = overrides

  return {
    message: {
      ...createUserMessage({
        content,
      }),
      ...(planContent ? { planContent } : {}),
    },
    ...rest,
  }
}

describe('dispatchReplInitialMessage', () => {
  test('preserves clear-context ordering and plan-message direct-query routing', async () => {
    const events: string[] = []
    let nextState = getDefaultAppState()

    const initialMessage = createInitialMessage({
      content: 'Implement the following plan',
      planContent: 'plan body',
      clearContext: true,
    })

    await dispatchReplInitialMessage(initialMessage, {
      clearConversation: async () => {
        events.push('clear')
      },
      readCurrentPlanSlug: () => {
        events.push('read-slug')
        return 'plan-123'
      },
      restorePlanSlug: slug => {
        events.push(`restore-slug:${slug}`)
      },
      resetLocalConversationState: () => {
        events.push('reset-local')
      },
      setAppState: updater => {
        events.push('set-app-state')
        nextState = updater(nextState)
      },
      maybeSnapshotFileHistory: uuid => {
        events.push(`snapshot:${uuid}`)
      },
      awaitPendingHooks: async () => {
        events.push('await-hooks')
      },
      submitInitialPrompt: content => {
        events.push(`submit:${content}`)
      },
      startDirectInitialQuery: message => {
        events.push(`direct:${message.planContent}`)
      },
      scheduleReset: () => {
        events.push('reset-latch')
      },
    })

    expect(events).toEqual([
      'read-slug',
      'clear',
      'reset-local',
      'restore-slug:plan-123',
      'set-app-state',
      `snapshot:${initialMessage.message.uuid}`,
      'await-hooks',
      'direct:plan body',
      'reset-latch',
    ])
    expect(nextState.initialMessage).toBeNull()
  })

  test('routes plain string content through prompt submit after hook sync', async () => {
    const events: string[] = []
    let nextState = getDefaultAppState()

    const initialMessage = createInitialMessage({
      content: 'plain prompt',
    })

    await dispatchReplInitialMessage(initialMessage, {
      clearConversation: async () => {
        events.push('clear')
      },
      readCurrentPlanSlug: () => undefined,
      restorePlanSlug: () => {
        events.push('restore-slug')
      },
      resetLocalConversationState: () => {
        events.push('reset-local')
      },
      setAppState: updater => {
        events.push('set-app-state')
        nextState = updater(nextState)
      },
      maybeSnapshotFileHistory: uuid => {
        events.push(`snapshot:${uuid}`)
      },
      awaitPendingHooks: async () => {
        events.push('await-hooks')
      },
      submitInitialPrompt: content => {
        events.push(`submit:${content}`)
      },
      startDirectInitialQuery: () => {
        events.push('direct')
      },
      scheduleReset: () => {
        events.push('reset-latch')
      },
    })

    expect(events).toEqual([
      'set-app-state',
      `snapshot:${initialMessage.message.uuid}`,
      'await-hooks',
      'submit:plain prompt',
      'reset-latch',
    ])
    expect(nextState.initialMessage).toBeNull()
  })

  test('stores pending plan verification only when the plan-verification guard is enabled', async () => {
    const oldUserType = process.env.USER_TYPE
    const oldVerifyPlan = process.env.CLAUDE_CODE_VERIFY_PLAN
    const initialMessage = createInitialMessage({
      content: 'Implement the following plan',
      planContent: 'plan body',
    })

    try {
      process.env.USER_TYPE = 'ant'
      process.env.CLAUDE_CODE_VERIFY_PLAN = 'true'

      let guardedState = getDefaultAppState()
      await dispatchReplInitialMessage(initialMessage, {
        clearConversation: async () => {},
        readCurrentPlanSlug: () => undefined,
        restorePlanSlug: () => {},
        resetLocalConversationState: () => {},
        setAppState: updater => {
          guardedState = updater(guardedState)
        },
        maybeSnapshotFileHistory: () => {},
        awaitPendingHooks: async () => {},
        submitInitialPrompt: () => {},
        startDirectInitialQuery: () => {},
        scheduleReset: () => {},
      })

      expect(guardedState.pendingPlanVerification).toEqual({
        plan: 'plan body',
        verificationStarted: false,
        verificationCompleted: false,
      })

      process.env.USER_TYPE = 'external'
      process.env.CLAUDE_CODE_VERIFY_PLAN = 'false'

      let unguardedState = getDefaultAppState()
      await dispatchReplInitialMessage(initialMessage, {
        clearConversation: async () => {},
        readCurrentPlanSlug: () => undefined,
        restorePlanSlug: () => {},
        resetLocalConversationState: () => {},
        setAppState: updater => {
          unguardedState = updater(unguardedState)
        },
        maybeSnapshotFileHistory: () => {},
        awaitPendingHooks: async () => {},
        submitInitialPrompt: () => {},
        startDirectInitialQuery: () => {},
        scheduleReset: () => {},
      })

      expect(unguardedState.pendingPlanVerification).toBeUndefined()
    } finally {
      process.env.USER_TYPE = oldUserType
      process.env.CLAUDE_CODE_VERIFY_PLAN = oldVerifyPlan
    }
  })
})
