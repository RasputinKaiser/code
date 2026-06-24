import { describe, expect, it } from 'bun:test'
import { resolvePromptInputQueuedCommandRestorePlan } from './promptInputQueuedCommandRestorePlan.js'

describe('resolvePromptInputQueuedCommandRestorePlan', () => {
  it('restores queued command text/cursor without changing pasted contents when no images exist', () => {
    expect(
      resolvePromptInputQueuedCommandRestorePlan({
        result: {
          text: 'queued prompt',
          cursorOffset: 5,
          images: [],
        },
        existingPastedContents: {
          1: {
            id: 1,
            type: 'text',
            content: 'existing attachment',
          },
        },
      }),
    ).toEqual({
      nextInput: 'queued prompt',
      nextMode: 'prompt',
      nextCursorOffset: 5,
      nextPastedContents: {
        1: {
          id: 1,
          type: 'text',
          content: 'existing attachment',
        },
      },
    })
  })

  it('merges restored queued images into the existing pasted-contents map', () => {
    expect(
      resolvePromptInputQueuedCommandRestorePlan({
        result: {
          text: 'queued prompt',
          cursorOffset: 12,
          images: [
            {
              id: 7,
              type: 'image',
              content: 'ZmFrZQ==',
              mediaType: 'image/png',
            },
          ],
        },
        existingPastedContents: {
          1: {
            id: 1,
            type: 'text',
            content: 'existing attachment',
          },
        },
      }),
    ).toEqual({
      nextInput: 'queued prompt',
      nextMode: 'prompt',
      nextCursorOffset: 12,
      nextPastedContents: {
        1: {
          id: 1,
          type: 'text',
          content: 'existing attachment',
        },
        7: {
          id: 7,
          type: 'image',
          content: 'ZmFrZQ==',
          mediaType: 'image/png',
        },
      },
    })
  })
})
