import { describe, expect, test } from 'bun:test'
import { shouldRenderFileContentAsMarkdown } from './FileContentPreview.js'

describe('FileContentPreview routing', () => {
  test('routes markdown files through the markdown renderer', () => {
    expect(shouldRenderFileContentAsMarkdown('/tmp/generated.md')).toBe(true)
    expect(shouldRenderFileContentAsMarkdown('/tmp/generated.markdown')).toBe(true)
  })

  test('leaves non-markdown files on the highlighted code path', () => {
    expect(shouldRenderFileContentAsMarkdown('/tmp/generated.ts')).toBe(false)
    expect(shouldRenderFileContentAsMarkdown('/tmp/README.md.backup')).toBe(false)
  })
})
