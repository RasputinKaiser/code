import { describe, expect, it } from 'bun:test'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import { extractInboundMessageFields } from './inboundMessages.js'

describe('extractInboundMessageFields', () => {
  it('skips non-user messages and empty user content', () => {
    expect(
      extractInboundMessageFields({
        type: 'assistant',
        message: { content: 'ignored' },
      } as never),
    ).toBeUndefined()

    expect(
      extractInboundMessageFields({
        type: 'user',
        message: { content: '' },
      } as never),
    ).toBeUndefined()

    expect(
      extractInboundMessageFields({
        type: 'user',
        message: { content: [] },
      } as never),
    ).toBeUndefined()
  })

  it('preserves string content and uuid for user messages', () => {
    const result = extractInboundMessageFields({
      type: 'user',
      uuid: 'user-uuid-1',
      message: { content: 'hello bridge' },
    } as never)

    expect(result).toEqual({
      content: 'hello bridge',
      uuid: 'user-uuid-1',
    })
  })

  it('normalizes malformed base64 image blocks and preserves valid blocks', () => {
    const content: ContentBlockParam[] = [
      {
        type: 'image',
        source: {
          type: 'base64',
          // PNG signature bytes; used when media_type is missing.
          data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
        } as never,
      } as never,
      {
        type: 'image',
        source: {
          type: 'base64',
          mediaType: 'image/jpeg',
          data: '/9j/4AAQSkZJRgABAQAAAQABAAD/',
        } as never,
      } as never,
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/gif',
          data: 'R0lGODlhAQABAAAAACw=',
        },
      } as never,
      {
        type: 'text',
        text: 'keep me',
      },
    ]

    const result = extractInboundMessageFields({
      type: 'user',
      uuid: 'user-uuid-2',
      message: { content },
    } as never)

    const normalized = result?.content as ContentBlockParam[]
    expect(normalized[0]).toMatchObject({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
      },
    })
    expect(normalized[1]).toMatchObject({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
      },
    })
    expect(normalized[2]).toEqual(content[2])
    expect(normalized[3]).toEqual(content[3])
  })
})
