import { describe, expect, test } from 'bun:test'

import {
  dispatchPromptInputImagePaste,
  dispatchPromptInputTextPaste,
} from './promptInputPasteDispatch.js'

describe('dispatchPromptInputImagePaste', () => {
  test('preserves image paste ordering and lazy-space behavior', () => {
    const events: string[] = []

    const result = dispatchPromptInputImagePaste(
      {
        image: 'base64',
        mediaType: undefined,
        filename: undefined,
        dimensions: {
          width: 10,
          height: 20,
        },
        sourcePath: '/tmp/a.png',
        nextPasteId: 4,
        pendingSpaceAfterPill: true,
      },
      {
        logImagePaste: () => {
          events.push('log')
        },
        setModePrompt: () => {
          events.push('mode:prompt')
        },
        cacheImagePath: content => {
          events.push(`cache:${content.id}:${content.mediaType}:${content.filename}`)
        },
        storeImage: content => {
          events.push(`store:${content.id}`)
        },
        addPastedContent: (id, content) => {
          events.push(`pasted:${id}:${content.type}`)
        },
        insertTextAtCursor: text => {
          events.push(`insert:${text}`)
        },
      },
    )

    expect(events).toEqual([
      'log',
      'mode:prompt',
      'cache:4:image/png:Pasted image',
      'store:4',
      'pasted:4:image',
      'insert: [Image #4]',
    ])
    expect(result).toEqual({
      nextPasteId: 5,
      pendingSpaceAfterPill: true,
    })
  })
})

describe('dispatchPromptInputTextPaste', () => {
  test('preserves long-text collapse and sanitization behavior', () => {
    const events: string[] = []

    const result = dispatchPromptInputTextPaste(
      {
        rawText: '\u001b[31mhello\tworld\rmore text\nline 2\nline 3\nline 4\nline 5',
        inputLength: 0,
        rows: 20,
        nextPasteId: 7,
      },
      {
        setMode: mode => {
          events.push(`mode:${mode}`)
        },
        addPastedContent: (id, content) => {
          events.push(`pasted:${id}:${content.type}:${content.content.includes('    ')}`)
        },
        insertTextAtCursor: text => {
          events.push(`insert:${text}`)
        },
      },
    )

    expect(events[0]).toBe('pasted:7:text:true')
    expect(events[1]).toContain('insert:[Pasted text #7')
    expect(result).toEqual({
      nextPasteId: 8,
      pendingSpaceAfterPill: false,
    })
  })

  test('preserves mode-switch pastes without creating pasted text content', () => {
    const events: string[] = []

    const result = dispatchPromptInputTextPaste(
      {
        rawText: '!ls',
        inputLength: 0,
        rows: 20,
        nextPasteId: 3,
      },
      {
        setMode: mode => {
          events.push(`mode:${mode}`)
        },
        addPastedContent: (id, content) => {
          events.push(`pasted:${id}:${content.type}`)
        },
        insertTextAtCursor: text => {
          events.push(`insert:${text}`)
        },
      },
    )

    expect(events).toEqual([
      'mode:bash',
      'insert:ls',
    ])
    expect(result).toEqual({
      nextPasteId: 3,
      pendingSpaceAfterPill: false,
    })
  })
})
