import { describe, expect, test } from 'bun:test'
import {
  detectPreformattedMarkdownSegments,
  looksLikePreformattedDiagram,
} from './markdown.js'

function makeStructuredDiagram(): string {
  return [
    'ncode client ──events──► platform-api ──► OpenTelemetry Collector',
    '                                                │',
    '',
    '                                     ────────────────────',
    '                                      │  GCP Cloud Monitoring│',
    '                                      │  (metrics, traces)   │',
    '                                      └────────────────────',
    '                                                │',
    '                                     ────────────────────',
    '                                      │  BigQuery (events)   │',
    '                                      │  - ncode_* events    │',
    '                                      │  - experiment data   │',
    '                                      └────────────────────',
  ].join('\n')
}

describe('detectPreformattedMarkdownSegments', () => {
  test('segments mixed prose + diagram + prose losslessly', () => {
    const diagram = makeStructuredDiagram()
    const content = [
      'Full Design Context',
      '',
      'Current Architecture',
      '',
      diagram,
      '',
      'Target Architecture',
      '',
      'The adapter is the key seam.',
    ].join('\n')

    const segments = detectPreformattedMarkdownSegments(content)

    expect(segments.map(segment => segment.type)).toEqual([
      'markdown',
      'preformatted_diagram',
      'markdown',
    ])
    expect(segments.map(segment => segment.content).join('')).toBe(content)
    expect(segments[1]).toMatchObject({
      type: 'preformatted_diagram',
    })
    expect(
      segments[1]?.type === 'preformatted_diagram'
        ? segments[1].content.trimEnd()
        : null,
    ).toBe(diagram)
  })

  test('supports multiple diagram segments in one message', () => {
    const first = makeStructuredDiagram()
    const second = [
      '                                     ────────────────',
      '                                      │  GrowthBook  │',
      '                                      └──────────────',
    ].join('\n')
    const content = [
      'Before',
      '',
      first,
      '',
      'Between',
      '',
      second,
      '',
      'After',
    ].join('\n')

    const segments = detectPreformattedMarkdownSegments(content)

    expect(segments.map(segment => segment.type)).toEqual([
      'markdown',
      'preformatted_diagram',
      'markdown',
      'preformatted_diagram',
      'markdown',
    ])
    expect(segments.map(segment => segment.content).join('')).toBe(content)
  })

  test('does not classify ordinary prose with arrows as a diagram', () => {
    const content = [
      'The flow is roughly client -> api -> storage and then back again.',
      '',
      'We should document the routine -> trigger mapping separately.',
    ].join('\n')

    expect(looksLikePreformattedDiagram(content)).toBe(false)
    expect(detectPreformattedMarkdownSegments(content)).toEqual([
      {
        type: 'markdown',
        content,
      },
    ])
  })

  test('does not classify markdown tables as diagrams', () => {
    const content = [
      '| Current | Target | Status |',
      '|---------|--------|--------|',
      '| trigger-first inspector | routine-first UI | gap identified |',
    ].join('\n')

    expect(detectPreformattedMarkdownSegments(content)).toEqual([
      {
        type: 'markdown',
        content,
      },
    ])
  })

  test('does not reclassify diagram-like text inside fenced blocks', () => {
    const content = [
      'Architecture sample:',
      '',
      '```text',
      'ncode client ──events──► platform-api ──► OpenTelemetry Collector',
      '                                                │',
      '',
      '                                     ────────────────────',
      '                                      │  GCP Cloud Monitoring│',
      '                                      │  (metrics, traces)   │',
      '                                      └────────────────────',
      '```',
      '',
      '| Target | Scheduler |',
      '|--------|-----------|',
      '| BYOC | Customer cluster |',
    ].join('\n')

    const segments = detectPreformattedMarkdownSegments(content)

    expect(segments).toEqual([
      {
        type: 'markdown',
        content,
      },
    ])
    expect(segments.map(segment => segment.content).join('')).toBe(content)
  })
})
