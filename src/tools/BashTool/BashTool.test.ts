import { describe, expect, it } from 'bun:test'

import {
  isAutobackgroundingAllowed,
  isSearchOrReadBashCommand,
} from './BashTool.js'

describe('isSearchOrReadBashCommand', () => {
  it('classifies pure search pipelines as searchable even with neutral commands mixed in', () => {
    expect(isSearchOrReadBashCommand('rg TODO src && echo "---" && grep -n bug README.md')).toEqual(
      {
        isSearch: true,
        isRead: false,
        isList: false,
      },
    )
  })

  it('classifies read and search pipelines independently when both appear', () => {
    expect(isSearchOrReadBashCommand('cat package.json | rg version')).toEqual({
      isSearch: true,
      isRead: true,
      isList: false,
    })
  })

  it('classifies directory listing compounds separately from file reads', () => {
    expect(isSearchOrReadBashCommand('ls src && echo done && tree src/utils')).toEqual(
      {
        isSearch: false,
        isRead: false,
        isList: true,
      },
    )
  })

  it('rejects pipelines that include non-read/search commands', () => {
    expect(isSearchOrReadBashCommand('cat package.json | sed -n "1,5p"')).toEqual(
      {
        isSearch: false,
        isRead: false,
        isList: false,
      },
    )
  })

  it('does not collapse commands that are only semantic-neutral output', () => {
    expect(isSearchOrReadBashCommand('echo hello && printf world')).toEqual({
      isSearch: false,
      isRead: false,
      isList: false,
    })
  })

  it('returns non-collapsible for malformed shell syntax', () => {
    expect(isSearchOrReadBashCommand('cat foo && (')).toEqual({
      isSearch: false,
      isRead: false,
      isList: false,
    })
  })
})


describe('isAutobackgroundingAllowed', () => {
  it('does not auto-background search commands on timeout', () => {
    expect(isAutobackgroundingAllowed('find . -type f')).toBe(false)
    expect(isAutobackgroundingAllowed('rg TODO src')).toBe(false)
    expect(isAutobackgroundingAllowed('grep -R TODO src')).toBe(false)
  })

  it('does not auto-background search pipelines on timeout', () => {
    expect(isAutobackgroundingAllowed('rg TODO src | head -20')).toBe(false)
    expect(isAutobackgroundingAllowed('find . -type f | wc -l')).toBe(false)
  })
})

describe('shouldAutoBackgroundOnAssistantTimeout', () => {
  it('PROVE: blocks assistant-mode auto-background for search commands', () => {
    const { shouldAutoBackgroundOnAssistantTimeout } = require('./BashTool.js')
    expect(shouldAutoBackgroundOnAssistantTimeout('rg TODO src', 'running', undefined)).toBe(false)
    expect(shouldAutoBackgroundOnAssistantTimeout('find . -type f', 'running', undefined)).toBe(false)
    expect(shouldAutoBackgroundOnAssistantTimeout('grep -R TODO src', 'running', undefined)).toBe(false)
    expect(shouldAutoBackgroundOnAssistantTimeout('find . -type f | wc -l', 'running', undefined)).toBe(false)
  })

  it('allows assistant-mode auto-background for non-search commands', () => {
    const { shouldAutoBackgroundOnAssistantTimeout } = require('./BashTool.js')
    expect(shouldAutoBackgroundOnAssistantTimeout('sleep 30', 'running', undefined)).toBe(true)
    expect(shouldAutoBackgroundOnAssistantTimeout('npm test', 'running', undefined)).toBe(true)
  })

  it('prevents double-backgrounding', () => {
    const { shouldAutoBackgroundOnAssistantTimeout } = require('./BashTool.js')
    expect(shouldAutoBackgroundOnAssistantTimeout('sleep 30', 'running', 'already-bg')).toBe(false)
  })

  it('requires running shell status', () => {
    const { shouldAutoBackgroundOnAssistantTimeout } = require('./BashTool.js')
    expect(shouldAutoBackgroundOnAssistantTimeout('sleep 30', 'completed', undefined)).toBe(false)
  })
})
