import { describe, expect, test } from 'bun:test'
import { InputEvent } from '../ink/events/input-event.js'
import { INITIAL_STATE, parseMultipleKeypresses, type ParsedKey } from '../ink/parse-keypress.js'
import { parseBindings } from './parser.js'
import { resolveKeyWithChordState } from './resolver.js'

function inputEventForRaw(raw: string): InputEvent {
  const [events] = parseMultipleKeypresses(INITIAL_STATE, raw)
  const event = events[0]
  expect(event?.kind).toBe('key')
  return new InputEvent(event as ParsedKey)
}

const bindings = parseBindings([
  {
    context: 'Chat',
    bindings: {
      enter: 'chat:submit',
      'ctrl+j': 'chat:newline',
    },
  },
])

describe('keybinding resolver newline shortcuts', () => {
  test('routes raw Ctrl+J LF to chat:newline instead of Enter submit', () => {
    const event = inputEventForRaw('\n')

    expect(resolveKeyWithChordState(event.input, event.key, ['Chat'], bindings, null)).toEqual({
      type: 'match',
      action: 'chat:newline',
    })
  })

  test('routes carriage-return Enter to chat:submit', () => {
    const event = inputEventForRaw('\r')

    expect(resolveKeyWithChordState(event.input, event.key, ['Chat'], bindings, null)).toEqual({
      type: 'match',
      action: 'chat:submit',
    })
  })
})
