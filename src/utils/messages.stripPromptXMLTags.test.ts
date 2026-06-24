import { describe, expect, test } from 'bun:test'
import { stripPromptXMLTags } from './messages.js'

describe('stripPromptXMLTags', () => {
  test('removes system reminders and preserves visible assistant text', () => {
    const content = [
      '<system-reminder>',
      'internal context',
      '</system-reminder>',
      '',
      '# Visible heading',
      '',
      '- visible item',
    ].join('\n')

    expect(stripPromptXMLTags(content)).toBe('# Visible heading\n\n- visible item')
  })

  test('removes turn_aborted markers and preserves surrounding text', () => {
    const content = [
      'before',
      '<turn_aborted>',
      'interrupted turn metadata',
      '</turn_aborted>',
      'after',
    ].join('\n')

    expect(stripPromptXMLTags(content)).toBe('before\nafter')
  })

  test('removes dangling system reminders through end of content', () => {
    const content = [
      '# Visible heading',
      '',
      '<system-reminder>',
      'internal context',
      '- hidden list item',
    ].join('\n')

    expect(stripPromptXMLTags(content)).toBe('# Visible heading')
  })

  test('removes stray closing internal tags without affecting visible text', () => {
    const content = ['before', '</turn_aborted>', 'after'].join('\n')

    expect(stripPromptXMLTags(content)).toBe('before\nafter')
  })
})
