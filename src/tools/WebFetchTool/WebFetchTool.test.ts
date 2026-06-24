import { describe, expect, it } from 'bun:test'

const {
  WebFetchTool,
  makeWebFetchSourceId,
  makeWebFetchSourceMetadata,
} = await import(import.meta.resolve('./WebFetchTool.ts'))
const { DESCRIPTION } = await import(import.meta.resolve('./prompt.ts'))

function extractTaggedContent(content: string, tag: string): string {
  const match = content.match(
    new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`),
  )
  if (!match?.[1]) {
    throw new Error(`Missing <${tag}> block in ${content}`)
  }
  return match[1]
}

describe('WebFetchTool runtime contract', () => {
  const output = {
    bytes: 1234,
    code: 200,
    codeText: 'OK',
    durationMs: 50,
    finalUrl: 'https://www.rfc-editor.org/rfc/rfc9728.html',
    redirectChain: ['https://www.rfc-editor.org/rfc/rfc9728.html'],
    requestedUrl: 'http://www.rfc-editor.org/rfc/rfc9728.html',
    result: 'Extracted page summary.',
    url: 'http://www.rfc-editor.org/rfc/rfc9728.html',
  }

  it('derives stable source handles from tool use IDs', () => {
    expect(makeWebFetchSourceId('functions.WebFetch:0')).toBe(
      'webfetch_functions_webfetch_0',
    )
    expect(makeWebFetchSourceId('')).toBe('webfetch_result')
    expect(makeWebFetchSourceId(' toolu_ABC-123:xyz ')).toBe(
      'webfetch_toolu_abc_123_xyz',
    )
  })

  it('builds runtime-owned source metadata for fetched content', () => {
    expect(makeWebFetchSourceMetadata(output, 'functions.WebFetch:0')).toEqual({
      source_id: 'webfetch_functions_webfetch_0',
      executor: 'client_local_fetch',
      requested_url: 'http://www.rfc-editor.org/rfc/rfc9728.html',
      final_url: 'https://www.rfc-editor.org/rfc/rfc9728.html',
      http_status: 200,
      http_status_text: 'OK',
      bytes_fetched: 1234,
      redirect_chain: ['https://www.rfc-editor.org/rfc/rfc9728.html'],
    })
  })

  it('falls back to url for older WebFetch outputs without finalUrl metadata', () => {
    expect(
      makeWebFetchSourceMetadata(
        {
          bytes: 10,
          code: 200,
          codeText: 'OK',
          durationMs: 2,
          result: 'Legacy summary',
          url: 'https://example.com/page',
        },
        'toolu_legacy',
      ),
    ).toEqual({
      source_id: 'webfetch_toolu_legacy',
      executor: 'client_local_fetch',
      requested_url: 'https://example.com/page',
      final_url: 'https://example.com/page',
      http_status: 200,
      http_status_text: 'OK',
      bytes_fetched: 10,
      redirect_chain: [],
    })
  })

  it('preserves stopped redirect targets in source metadata', () => {
    expect(
      makeWebFetchSourceMetadata(
        {
          bytes: 256,
          code: 302,
          codeText: 'Found',
          durationMs: 2,
          finalUrl: 'https://example.com/start',
          redirectChain: ['https://attacker.example/steal'],
          redirectUrl: 'https://attacker.example/steal',
          requestedUrl: 'https://example.com/start',
          result: 'Redirect detected.',
          url: 'https://example.com/start',
        },
        'toolu_redirect',
      ),
    ).toEqual({
      source_id: 'webfetch_toolu_redirect',
      executor: 'client_local_fetch',
      requested_url: 'https://example.com/start',
      final_url: 'https://example.com/start',
      http_status: 302,
      http_status_text: 'Found',
      bytes_fetched: 256,
      redirect_chain: ['https://attacker.example/steal'],
      redirect_url: 'https://attacker.example/steal',
    })
  })

  it('keeps parseable source metadata visible to the follow-up model turn', () => {
    const block = WebFetchTool.mapToolResultToToolResultBlockParam!(
      output,
      'functions.WebFetch:0',
    )
    expect(block.type).toBe('tool_result')
    expect(block.tool_use_id).toBe('functions.WebFetch:0')
    expect(typeof block.content).toBe('string')
    const content = String(block.content)

    expect(content).not.toContain('<web_fetch_metadata>')
    expect(content).toContain('<web_fetch_source>')
    expect(content).toContain('<web_fetch_source_instructions>')
    expect(content).toContain('<web_fetch_result>')
    expect(extractTaggedContent(content, 'web_fetch_result')).toBe(
      'Extracted page summary.',
    )

    expect(
      JSON.parse(extractTaggedContent(content, 'web_fetch_source')),
    ).toEqual({
      source_id: 'webfetch_functions_webfetch_0',
      executor: 'client_local_fetch',
      requested_url: 'http://www.rfc-editor.org/rfc/rfc9728.html',
      final_url: 'https://www.rfc-editor.org/rfc/rfc9728.html',
      http_status: 200,
      http_status_text: 'OK',
      bytes_fetched: 1234,
      redirect_chain: ['https://www.rfc-editor.org/rfc/rfc9728.html'],
    })
  })

  it('documents the source-id citation contract in the tool prompt', async () => {
    expect(DESCRIPTION).toContain('stable source_id')
    expect(DESCRIPTION).toContain('Do not reconstruct')
    expect(await WebFetchTool.prompt({} as never)).toContain(
      'web_fetch_source metadata record',
    )
  })
})
