import { describe, expect, it } from 'bun:test'
import {
  extractCommandArguments,
  PARSE_ABORTED,
} from './parser.js'
import type { Node } from './parser.js'

function makeNode(
  type: string,
  text: string,
  children: Node[] = [],
): Node {
  return {
    type,
    text,
    startIndex: 0,
    endIndex: text.length,
    children,
  }
}

describe('extractCommandArguments', () => {
  it('extracts command name and arguments from a simple command', () => {
    const node = makeNode('command', 'git status --short', [
      makeNode('command_name', 'git'),
      makeNode('word', 'status'),
      makeNode('word', '--short'),
    ])

    expect(extractCommandArguments(node)).toEqual([
      'git',
      'status',
      '--short',
    ])
  })

  it('ignores variable assignments before the command name', () => {
    const node = makeNode('command', 'FOO=bar git status', [
      makeNode('variable_assignment', 'FOO=bar'),
      makeNode('command_name', 'git'),
      makeNode('word', 'status'),
    ])

    expect(extractCommandArguments(node)).toEqual(['git', 'status'])
  })

  it('strips quotes from string arguments', () => {
    const node = makeNode('command', 'echo "hello world"', [
      makeNode('command_name', 'echo'),
      makeNode('string', '"hello world"'),
    ])

    expect(extractCommandArguments(node)).toEqual(['echo', 'hello world'])
  })

  it('handles declaration commands', () => {
    const node = makeNode('declaration_command', 'export PATH=/usr/bin', [
      makeNode('word', 'export'),
      makeNode('word', 'PATH=/usr/bin'),
    ])

    expect(extractCommandArguments(node)).toEqual(['export'])
  })

  it('stops at command substitution', () => {
    const node = makeNode('command', 'echo $(date)', [
      makeNode('command_name', 'echo'),
      makeNode('command_substitution', '$(date)'),
    ])

    expect(extractCommandArguments(node)).toEqual(['echo'])
  })

  it('treats bare words as command name when no command_name child', () => {
    const node = makeNode('command', 'ls -la', [
      makeNode('word', 'ls'),
      makeNode('word', '-la'),
    ])

    expect(extractCommandArguments(node)).toEqual(['ls', '-la'])
  })

  it('preserves raw_string and number argument types', () => {
    const node = makeNode('command', "printf '%s' 42", [
      makeNode('command_name', 'printf'),
      makeNode('raw_string', "'%s'"),
      makeNode('number', '42'),
    ])

    expect(extractCommandArguments(node)).toEqual([
      'printf',
      '%s',
      '42',
    ])
  })
})

describe('PARSE_ABORTED sentinel', () => {
  it('is a unique symbol', () => {
    expect(typeof PARSE_ABORTED).toBe('symbol')
  })
})
