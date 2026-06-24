import { describe, expect, it } from 'bun:test'
import { createAssistantMessage, createUserMessage } from '../../utils/messages.js'
import {
  collectWebFetchSourcesFromMessages,
  extractWebFetchSourcesFromText,
  repairAssistantMessageWebFetchProvenance,
  repairWebFetchProvenanceInText,
} from './sourceProvenance.js'

const SOURCE_BLOCK = [
  '<web_fetch_source>',
  '{"source_id":"webfetch_functions_webfetch_0","executor":"client_local_fetch","requested_url":"http://www.rfc-editor.org/rfc/rfc9728.html","final_url":"https://www.rfc-editor.org/rfc/rfc9728.html","http_status":200,"http_status_text":"OK","bytes_fetched":168507,"redirect_chain":[]}',
  '</web_fetch_source>',
  '<web_fetch_result>',
  'RFC 9728 summary.',
  '</web_fetch_result>',
].join('\n')

const TOOL_RESULT_MESSAGE = createUserMessage({
  content: [
    {
      type: 'tool_result',
      tool_use_id: 'functions.WebFetch:0',
      content: SOURCE_BLOCK,
    },
  ],
})

describe('WebFetch source provenance runtime repair', () => {
  it('extracts parseable source records from WebFetch tool result text', () => {
    expect(extractWebFetchSourcesFromText(SOURCE_BLOCK)).toEqual([
      {
        source_id: 'webfetch_functions_webfetch_0',
        executor: 'client_local_fetch',
        requested_url: 'http://www.rfc-editor.org/rfc/rfc9728.html',
        final_url: 'https://www.rfc-editor.org/rfc/rfc9728.html',
        http_status: 200,
        http_status_text: 'OK',
        bytes_fetched: 168507,
        redirect_chain: [],
      },
    ])
  })

  it('collects source records from prior conversation messages', () => {
    expect(collectWebFetchSourcesFromMessages([TOOL_RESULT_MESSAGE])).toHaveLength(
      1,
    )
  })

  it('repairs exact URL fields in JSON objects keyed by source_id', () => {
    expect(
      repairWebFetchProvenanceInText(
        '{"source_id":"webfetch_functions_webfetch_0","final_url":"https://www.rfc-editor.org/rfc9728.html","fetched_url":"https://wrong.example/rfc9728","rfc":9728}',
        collectWebFetchSourcesFromMessages([TOOL_RESULT_MESSAGE]),
      ),
    ).toBe(
      '{"source_id":"webfetch_functions_webfetch_0","final_url":"https://www.rfc-editor.org/rfc/rfc9728.html","fetched_url":"https://www.rfc-editor.org/rfc/rfc9728.html","rfc":9728}',
    )
  })

  it('repairs nested source arrays without changing unrelated entries', () => {
    expect(
      repairWebFetchProvenanceInText(
        JSON.stringify({
          answer: 'ok',
          sources: [
            {
              source_id: 'webfetch_functions_webfetch_0',
              url: 'https://www.rfc-editor.org/rfc9728.html',
            },
            { source_id: 'unrelated', url: 'https://example.com' },
          ],
        }),
        collectWebFetchSourcesFromMessages([TOOL_RESULT_MESSAGE]),
      ),
    ).toBe(
      JSON.stringify({
        answer: 'ok',
        sources: [
          {
            source_id: 'webfetch_functions_webfetch_0',
            url: 'https://www.rfc-editor.org/rfc/rfc9728.html',
          },
          { source_id: 'unrelated', url: 'https://example.com' },
        ],
      }),
    )
  })

  it('preserves JSON code fences while repairing source URLs', () => {
    expect(
      repairWebFetchProvenanceInText(
        [
          '```json',
          '{',
          '  "source_id": "webfetch_functions_webfetch_0",',
          '  "final_url": "https://www.rfc-editor.org/rfc9728.html"',
          '}',
          '```',
        ].join('\n'),
        collectWebFetchSourcesFromMessages([TOOL_RESULT_MESSAGE]),
      ),
    ).toBe(
      [
        '```json',
        '{',
        '  "source_id": "webfetch_functions_webfetch_0",',
        '  "final_url": "https://www.rfc-editor.org/rfc/rfc9728.html"',
        '}',
        '```',
      ].join('\n'),
    )
  })

  it('appends deterministic source references for plain text source handles', () => {
    expect(
      repairWebFetchProvenanceInText(
        'See webfetch_functions_webfetch_0 for details.',
        collectWebFetchSourcesFromMessages([TOOL_RESULT_MESSAGE]),
      ),
    ).toBe(
      [
        'See webfetch_functions_webfetch_0 for details.',
        '',
        'Sources:',
        '- webfetch_functions_webfetch_0: https://www.rfc-editor.org/rfc/rfc9728.html',
      ].join('\n'),
    )
  })

  it('repairs assistant text before the runtime yields it', () => {
    const assistant = createAssistantMessage({
      content:
        '{"source_id":"webfetch_functions_webfetch_0","final_url":"https://www.rfc-editor.org/rfc9728.html"}',
    })
    const repaired = repairAssistantMessageWebFetchProvenance(assistant, [
      TOOL_RESULT_MESSAGE,
    ])

    expect(repaired.message.content).toEqual([
      {
        type: 'text',
        text: '{"source_id":"webfetch_functions_webfetch_0","final_url":"https://www.rfc-editor.org/rfc/rfc9728.html"}',
      },
    ])
  })
})
