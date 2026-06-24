import { describe, expect, it } from 'bun:test'
import { parseSlashCommand } from './slashCommandParsing.js'

describe('parseSlashCommand', () => {
  it('parses a normal slash command into name and args', () => {
    expect(parseSlashCommand('/search foo bar')).toEqual({
      commandName: 'search',
      args: 'foo bar',
      isMcp: false,
    })
  })

  it('trims surrounding whitespace and preserves empty args for bare commands', () => {
    expect(parseSlashCommand('   /compact   ')).toEqual({
      commandName: 'compact',
      args: '',
      isMcp: false,
    })
  })

  it('parses MCP command syntax by folding the marker into the command name', () => {
    expect(parseSlashCommand('/mcp:tool (MCP) arg1 arg2')).toEqual({
      commandName: 'mcp:tool (MCP)',
      args: 'arg1 arg2',
      isMcp: true,
    })
  })

  it('rejects inputs that are not valid slash commands', () => {
    expect(parseSlashCommand('search foo')).toBeNull()
    expect(parseSlashCommand('/')).toBeNull()
    expect(parseSlashCommand('   /   ')).toBeNull()
  })
})
