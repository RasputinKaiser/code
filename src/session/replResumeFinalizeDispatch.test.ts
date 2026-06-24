import { describe, expect, test } from 'bun:test'

import type { Message } from '../types/message.js'
import { dispatchReplResumeFinalize } from './replResumeFinalizeDispatch.js'

describe('dispatchReplResumeFinalize', () => {
  test('reconstructs content replacements for non-fork resumes before committing messages', () => {
    const events: string[] = []
    const messages = [{ uuid: 'm1' }] as Message[]
    const replacementState = { enabled: true }
    const reconstructed = { state: 'reconstructed' }

    dispatchReplResumeFinalize({
      messages,
      entrypoint: 'cli_flag',
      contentReplacementState: replacementState,
      contentReplacementRecords: [{ toolUseId: 'tool-1' } as any],
      reconstructContentReplacementState: (nextMessages, records) => {
        events.push(`reconstruct:${nextMessages === messages}:${records.length}`)
        return reconstructed
      },
      setContentReplacementState: state => {
        events.push(`set-replacement-state:${state === reconstructed}`)
      },
      commitMessages: nextMessages => {
        events.push(`commit-messages:${nextMessages === messages}`)
      },
      clearToolJSX: () => {
        events.push('clear-tool-jsx')
      },
      clearInputValue: () => {
        events.push('clear-input')
      },
    })

    expect(events).toEqual([
      'reconstruct:true:1',
      'set-replacement-state:true',
      'commit-messages:true',
      'clear-tool-jsx',
      'clear-input',
    ])
  })

  test('skips content replacement reconstruction for fork resumes and disabled state', () => {
    const events: string[] = []
    const messages = [{ uuid: 'm1' }] as Message[]

    dispatchReplResumeFinalize({
      messages,
      entrypoint: 'fork',
      contentReplacementState: { enabled: true },
      contentReplacementRecords: [{ toolUseId: 'tool-1' } as any],
      reconstructContentReplacementState: () => {
        events.push('reconstruct')
        return {}
      },
      setContentReplacementState: () => {
        events.push('set-replacement-state')
      },
      commitMessages: () => {
        events.push('commit-messages')
      },
      clearToolJSX: () => {
        events.push('clear-tool-jsx')
      },
      clearInputValue: () => {
        events.push('clear-input')
      },
    })

    expect(events).toEqual([
      'commit-messages',
      'clear-tool-jsx',
      'clear-input',
    ])
  })
})
