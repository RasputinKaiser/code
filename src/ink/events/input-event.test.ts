import { describe, expect, it } from 'bun:test'
import { INITIAL_STATE, parseMultipleKeypresses, type ParsedKey } from '../parse-keypress.js'
import { InputEvent } from './input-event.js'

function inputEventForRaw(raw: string): InputEvent {
  const [events] = parseMultipleKeypresses(INITIAL_STATE, raw)
  const event = events[0]
  expect(event?.kind).toBe('key')
  return new InputEvent(event as ParsedKey)
}

describe('InputEvent', () => {
  it('maps raw LF to Ctrl+J rather than the return submit signal', () => {
    const event = inputEventForRaw('\n')

    expect(event.input).toBe('j')
    expect(event.key.ctrl).toBe(true)
    expect(event.key.return).toBe(false)
  })

  it('normalizes explicit enter keypresses into the return signal', () => {
    const event = new InputEvent({
      kind: 'key',
      name: 'enter',
      sequence: '\n',
      raw: '\n',
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
      super: false,
      fn: false,
    })

    expect(event.key.return).toBe(true)
  })

  it('normalizes CSI tilde modified Enter into Shift+Enter', () => {
    const event = inputEventForRaw('\x1b[13;2~')

    expect(event.key.return).toBe(true)
    expect(event.key.shift).toBe(true)
    expect(event.key.ctrl).toBe(false)
  })

  it('keeps return keypresses mapped to the return signal', () => {
    const event = new InputEvent({
      kind: 'key',
      name: 'return',
      sequence: '\r',
      raw: '\r',
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
      super: false,
      fn: false,
    })

    expect(event.key.return).toBe(true)
  })
})
