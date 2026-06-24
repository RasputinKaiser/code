import { describe, expect, it } from 'bun:test'
import type { PastedContent } from '../utils/config.js'
import {
  buildRemoteSubmitPayload,
  dispatchRemoteSubmit,
} from './remoteSubmitDispatch.js'

describe('buildRemoteSubmitPayload', () => {
  it('keeps plain text submits as trimmed strings', () => {
    const result = buildRemoteSubmitPayload({
      input: '  hello remote  ',
      pastedContents: {},
    })

    expect(result.messageContent).toBe('hello remote')
    expect(result.remoteContent).toBe('hello remote')
  })

  it('serializes text and image attachments in UI order', () => {
    const pastedContents: Record<number, PastedContent> = {
      1: {
        id: 1,
        type: 'text',
        content: 'first attachment',
      },
      2: {
        id: 2,
        type: 'image',
        content: 'ZmFrZS1pbWFnZQ==',
        mediaType: 'image/png',
      },
      3: {
        id: 3,
        type: 'text',
        content: 'third attachment',
      },
    }

    const result = buildRemoteSubmitPayload({
      input: '  hello remote  ',
      pastedContents,
    })

    expect(result.imagePasteIds).toEqual([2])
    expect(result.messageContent).toEqual([
      { type: 'text', text: 'hello remote' },
      { type: 'text', text: 'first attachment' },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: 'ZmFrZS1pbWFnZQ==',
        },
      },
      { type: 'text', text: 'third attachment' },
    ])
    expect(result.remoteContent).toEqual(result.messageContent)
  })
})

describe('dispatchRemoteSubmit', () => {
  it('appends the mirrored user message before sending with the same uuid', async () => {
    const events: string[] = []
    let appendedMessage: { uuid: string } | null = null
    let sentUuid: string | null = null
    let sentContent: unknown = null

    await dispatchRemoteSubmit(
      {
        input: 'remote prompt',
        pastedContents: {},
      },
      {
        appendUserMessage: message => {
          events.push('append')
          appendedMessage = message
        },
        sendMessage: async (content, options) => {
          events.push('send')
          sentUuid = options.uuid
          sentContent = content
        },
      },
    )

    expect(events).toEqual(['append', 'send'])
    expect(sentUuid).toBe(appendedMessage?.uuid)
    expect(sentContent).toBe('remote prompt')
  })
})
