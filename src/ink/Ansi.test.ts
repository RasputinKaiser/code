import { beforeEach, describe, expect, it } from 'bun:test'
import {
  clearAnsiSpanCache,
  parseToSpans,
  resolveAnsiRenderProps,
} from './Ansi.js'

beforeEach(() => {
  clearAnsiSpanCache()
})

describe('Ansi span cache contracts', () => {
  it('does not leak dim styling from a cached span parse into a later non-dim render', () => {
    const styled = `\x1b[31m${'cached ansi block '.repeat(48)}\x1b[0m`

    const firstPass = parseToSpans(styled).map(span =>
      resolveAnsiRenderProps(span.props, true),
    )
    const secondPass = parseToSpans(styled).map(span =>
      resolveAnsiRenderProps(span.props, false),
    )

    expect(firstPass.some(props => props.dim === true)).toBe(true)
    expect(secondPass.some(props => props.dim === true)).toBe(false)
    expect(secondPass.some(props => props.color !== undefined)).toBe(true)
  })
})
