import { describe, expect, it } from 'bun:test'
import {
  buildStarshipStatusLineChunks,
  renderStarshipStatusLineText,
} from './starshipStatusLine.js'

function summarize(
  chunks: ReturnType<typeof buildStarshipStatusLineChunks>,
): Array<{
  text: string
  color?: string
  bold?: boolean
  dim?: boolean
}> {
  return chunks.map(({ text, color, bold, dim }) => ({
    text,
    color,
    bold,
    dim,
  }))
}

describe('buildStarshipStatusLineChunks', () => {
  it('builds the default NCode footer row contract', () => {
    expect(
      summarize(
        buildStarshipStatusLineChunks({
          modelName: 'Opus 4.6',
          effortLevel: 'high',
          contextRemaining: 25,
          cwd: '/mlstore/src/noumena/ncode.cc',
          permissionMode: 'default',
        }),
      ),
    ).toEqual([
      { text: '◉', color: 'suggestion', bold: true, dim: undefined },
      { text: ' ', color: undefined, bold: undefined, dim: undefined },
      {
        text: 'Opus 4.6',
        color: 'suggestion',
        bold: true,
        dim: undefined,
      },
      { text: ' · ', color: 'subtle', bold: undefined, dim: true },
      {
        text: 'high',
        color: 'suggestion',
        bold: true,
        dim: undefined,
      },
      { text: '  ', color: 'subtle', bold: undefined, dim: true },
      { text: '◔', color: 'warning', bold: true, dim: undefined },
      { text: ' ', color: undefined, bold: undefined, dim: undefined },
      { text: '25% left', color: 'warning', bold: undefined, dim: undefined },
      { text: '  ', color: 'subtle', bold: undefined, dim: true },
      { text: '⌂', color: 'professionalBlue', bold: true, dim: undefined },
      { text: ' ', color: undefined, bold: undefined, dim: undefined },
      {
        text: '/mlstore/src/noumena/ncode.cc',
        color: 'professionalBlue',
        bold: undefined,
        dim: undefined,
      },
    ])
  })

  it('renders the default NCode footer visible-text contract', () => {
    expect(
      renderStarshipStatusLineText({
        modelName: 'Opus 4.6',
        effortLevel: 'high',
        contextRemaining: 25,
        cwd: '/mlstore/src/noumena/ncode.cc',
        permissionMode: 'default',
      }),
    ).toBe('◉ Opus 4.6 · high  ◔ 25% left  ⌂ /mlstore/src/noumena/ncode.cc')
  })

  it('renders only truthful conditional modules when state is present', () => {
    const summary = summarize(
      buildStarshipStatusLineChunks({
        modelName: 'Sonnet 4.6',
        effortLevel: 'max',
        contextRemaining: 8,
        cwd: '/worktrees/fix-footer',
        worktreeName: 'worktree-fix-footer',
        worktreeBranch: 'fix-footer',
        isRemote: true,
        activeLabel: '@reviewer',
        permissionMode: 'plan',
      }),
    )

    expect(summary).toContainEqual({
      text: '8% left',
      color: 'error',
      bold: undefined,
      dim: undefined,
    })
    expect(summary).toContainEqual({
      text: 'worktree-fix-footer',
      color: undefined,
      bold: true,
      dim: undefined,
    })
    expect(summary).toContainEqual({
      text: 'fix-footer',
      color: undefined,
      bold: undefined,
      dim: undefined,
    })
    expect(summary).toContainEqual({
      text: 'remote',
      color: 'warning',
      bold: undefined,
      dim: undefined,
    })
    expect(summary).toContainEqual({
      text: 'plan',
      color: 'planMode',
      bold: undefined,
      dim: undefined,
    })
    expect(summary).toContainEqual({
      text: '@reviewer',
      color: undefined,
      bold: true,
      dim: undefined,
    })
  })

  it('omits placeholder modules when the state is default or unknown', () => {
    const summary = summarize(
      buildStarshipStatusLineChunks({
        modelName: 'opus-4-6',
        effortLevel: 'medium',
        contextRemaining: null,
        cwd: '/repo',
        activeLabel: 'Main',
        permissionMode: 'default',
      }),
    )

    expect(summary.some(chunk => chunk.text === '◔')).toBe(false)
    expect(summary.some(chunk => chunk.text.includes('Fast'))).toBe(false)
    expect(summary.some(chunk => chunk.text === 'Main')).toBe(false)
    expect(summary.some(chunk => chunk.text.includes('default'))).toBe(false)
  })

  it('omits the path module when cwd display is hidden', () => {
    const summary = summarize(
      buildStarshipStatusLineChunks({
        modelName: 'Opus 4.6',
        effortLevel: 'high',
        contextRemaining: 40,
        cwd: null,
        permissionMode: 'default',
      }),
    )

    expect(summary.some(chunk => chunk.text === '⌂')).toBe(false)
  })
})
