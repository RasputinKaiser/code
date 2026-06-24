import { describe, expect, test } from 'bun:test'
import { getCachedMarkdownRenderBlocks } from './Markdown.js'
import {
  getMarkdownRenderStatsSnapshot,
  resetMarkdownRenderStatsForTesting,
} from './Markdown/markdownRenderStats.js'
import { applyMarkdown, repairMalformedPipeTables } from '../utils/markdown.js'

function makeLargeCodeFence(lineCount = 40): string {
  const lines = Array.from({ length: lineCount }, (_, index) => {
    return `export const value_${index.toString().padStart(2, '0')} = '${`${index}`.padEnd(72, 'x')}';`
  })

  return ['assistant summary', '', '```ts', ...lines, '```'].join('\n')
}

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
    '                                                │',
    '',
    '                                     ────────────────────',
    '                                      │  GrowthBook          │',
    '                                      │  - queries BigQuery  │',
    '                                      │    for experiment    │',
    '                                      │    analysis          │',
    '                                      └────────────────────',
  ].join('\n')
}

function makeMixedDiagramMessage(): string {
  return [
    'Full Design Context',
    '',
    'Current Architecture',
    '',
    makeStructuredDiagram(),
    '',
    'Target Architecture',
    '',
    'The adapter is the key seam.',
  ].join('\n')
}

function makeIndentedFencedDiagramAndTableSample(): string {
  return [
    '  ```',
    '  ────────────────────────────────────────────────────────────',
    '  │                      NCODE BASE SESSION                       │',
    '  │              (Noumena OAuth or Noumena API Key)              │',
    '  └────────────────────────────────────────────────────────────',
    '                       │',
    '      ────────────────────────────',
    '',
    '    ──────────   ──────────   ──────────',
    '     │  direct  │    │  remote  │    │   ssh    │',
    '     │  Session │    │  Session │    │  Session │',
    '     └──────────    └────────    └──────────',
    '                      │',
    '     ────────────────────────────',
    '',
    '    ──────────  ──────────  ──────────',
    '     │  Noumena │   │   BYOK   │   │   BYOC   │',
    '     │  manages │   │   key    │   │  cluster │',
    '     │  (GKE)   │   │  + GKE   │   │  (your   │',
    '     │          │   │          │   │  k8s)    │',
    '     └──────────   └──────────   └──────────',
    '  ```',
    '',
    '  - **BYOK** = Bring Your Own Key (customer provides Anthropic/OpenAI key)',
    '  - **BYOC** = Bring Your Own Cluster (customer provides k8s cluster)',
    '',
    '  Same lifecycle, different scheduling targets:',
    '',
    '  | Target | Scheduler | API | Use Case |',
    '  |--------|-----------|-----|----------|',
    '  | Noumena-managed | GKE (ours) | Noumena API | Fully managed |',
    '  | BYOK | GKE (ours) | Noumena API + customer key | Controlled infra, own AI spend |',
    "  | BYOC | Customer's k8s | Direct to customer's cluster | Air-gapped, compliance |",
    '',
    '  And the scheduler interface is abstracted - could be:',
    '  - Kubernetes API (`kubectl apply` / client-go)',
    '  - Higher-level (Argo, Flux, etc.)',
    '  - Straight to GKE API for Noumena-managed',
  ].join('\n')
}

function makeMalformedPipeTableCase(columnCount: number, delimiterCount: number) {
  const headers = Array.from({ length: columnCount }, (_, index) => `H${index + 1}`)
  const firstRowCells = Array.from({ length: columnCount }, (_, index) => `R1C${index + 1}`)
  const secondRowCells = Array.from({ length: columnCount }, (_, index) => `R2C${index + 1}`)
  const firstRowPrefix = firstRowCells.slice(0, Math.max(1, columnCount - 1))
  const firstRowSuffix = firstRowCells.slice(firstRowPrefix.length)
  const secondRowPrefix = secondRowCells.slice(0, Math.max(1, columnCount - 2))
  const secondRowSuffix = secondRowCells.slice(secondRowPrefix.length)

  return {
    headers,
    content: [
      `| ${headers.join(' | ')} |`,
      `|${Array.from({ length: delimiterCount }, () => '---').join('|')}|`,
      `| ${firstRowPrefix.join(' | ')}`,
      ` | ${firstRowSuffix.join(' | ')} |`,
      `| ${secondRowPrefix.join(' | ')}`,
      `  ${secondRowSuffix.join(' | ')} |`,
    ].join('\n'),
  }
}

describe('Markdown render block cache', () => {
  test('reuses the rendered block plan for large remounted markdown', () => {
    resetMarkdownRenderStatsForTesting()
    const content = makeLargeCodeFence()

    const first = getCachedMarkdownRenderBlocks(content, 'dark', null)
    const second = getCachedMarkdownRenderBlocks(content, 'dark', null)

    expect(second).toBe(first)
    expect(first.map(block => block.type)).toEqual(['ansi', 'code'])
  })

  test('preserves ansi-table-ansi block boundaries', () => {
    resetMarkdownRenderStatsForTesting()
    const content = [
      'before',
      '',
      '| a | b |',
      '| - | - |',
      '| 1 | 2 |',
      '',
      'after',
    ].join('\n')

    const blocks = getCachedMarkdownRenderBlocks(content, 'dark', null)

    expect(blocks.map(block => block.type)).toEqual(['ansi', 'table', 'ansi'])
  })

  test('preserves ansi-code-ansi block boundaries for fenced code', () => {
    resetMarkdownRenderStatsForTesting()
    const content = [
      'before',
      '',
      '```ts',
      'export const value = 1',
      '```',
      '',
      'after',
    ].join('\n')

    const blocks = getCachedMarkdownRenderBlocks(content, 'dark', null)

    expect(blocks.map(block => block.type)).toEqual(['ansi', 'code', 'ansi'])
    expect(blocks[1]).toMatchObject({
      type: 'code',
      code: 'export const value = 1',
      language: 'ts',
    })
    expect(getMarkdownRenderStatsSnapshot()).toMatchObject({
      buildCalls: 1,
      codeFenceFormatCalls: 0,
      lastCodeFenceFormat: null,
    })
    const fallbackAnsi =
      blocks[1]?.type === 'code' ? blocks[1].getFallbackAnsi() : null
    expect(fallbackAnsi).toContain('export const value = 1')
    expect(getMarkdownRenderStatsSnapshot()).toMatchObject({
      codeFenceFormatCalls: 1,
      lastCodeFenceFormat: {
        codeLength: 'export const value = 1'.length,
        language: 'ts',
      },
    })
  })

  test('treats structured box-drawing diagrams as preformatted code blocks', () => {
    resetMarkdownRenderStatsForTesting()
    const content = makeStructuredDiagram()

    const blocks = getCachedMarkdownRenderBlocks(content, 'dark', null)

    expect(blocks.map(block => block.type)).toEqual(['code'])
    expect(blocks[0]).toMatchObject({
      type: 'code',
      code: content,
      language: '',
    })
  })

  test('applyMarkdown preserves structured diagram spacing', () => {
    const content = makeStructuredDiagram()

    const rendered = applyMarkdown(content, 'dark', null)

    expect(rendered).toContain(
      'ncode client ──events──► platform-api ──► OpenTelemetry Collector',
    )
    expect(rendered).toContain(
      '                                      │  GCP Cloud Monitoring│',
    )
    expect(rendered).toContain(
      '                                      │  - experiment data   │',
    )
  })

  test('preserves prose-diagram-prose block boundaries', () => {
    resetMarkdownRenderStatsForTesting()
    const content = makeMixedDiagramMessage()

    const blocks = getCachedMarkdownRenderBlocks(content, 'dark', null)

    expect(blocks.map(block => block.type)).toEqual(['ansi', 'code', 'ansi'])
    expect(blocks[0]).toMatchObject({
      type: 'ansi',
    })
    expect(blocks[1]).toMatchObject({
      type: 'code',
      language: '',
    })
    expect(blocks[1]?.type === 'code' ? blocks[1].code.trimEnd() : null).toBe(
      makeStructuredDiagram(),
    )
    expect(blocks[2]).toMatchObject({
      type: 'ansi',
    })
  })

  test('keeps indented fenced diagrams intact and still parses following lists and tables', () => {
    resetMarkdownRenderStatsForTesting()
    const content = makeIndentedFencedDiagramAndTableSample()

    const blocks = getCachedMarkdownRenderBlocks(content, 'dark', null)

    expect(blocks.map(block => block.type)).toEqual([
      'code',
      'ansi',
      'table',
      'ansi',
    ])
    expect(blocks[0]).toMatchObject({
      type: 'code',
      language: '',
    })
    expect(blocks[0]?.type === 'code' ? blocks[0].code : null).toContain(
      'NCODE BASE SESSION',
    )
    expect(blocks[1]?.type === 'ansi' ? blocks[1].content : null).toContain(
      'Bring Your Own Key',
    )
    expect(blocks[2]).toMatchObject({
      type: 'table',
    })
    expect(blocks[3]?.type === 'ansi' ? blocks[3].content : null).toContain(
      'Kubernetes API',
    )

    const rendered = applyMarkdown(content, 'dark', null)
    expect(rendered).not.toContain('```')
    expect(rendered).toContain('NCODE BASE SESSION')
    expect(rendered).toContain('Noumena-managed')
    expect(rendered).toContain('Fully managed')
    expect(rendered).toContain('Kubernetes API')
  })

  test('repairs short table delimiter rows and wrapped physical rows from model output', () => {
    resetMarkdownRenderStatsForTesting()
    const content = [
      'Tier 1: Hard blockers — will panic or return unimplemented',
      '',
      '| System | Local Behavior | Hosted Behavior | Impact |',
      '|---|---|',
      '| Scheduler / WorkerExecutor | unimplemented!("private build only") in runtime/sharding/src/local.rs:20-38 | Full shard assignment via hosted control-plane variables',
      ' | Services cannot run partitioned without this |',
      '| Database lag monitor | unimplemented!() in db_ext/src/local.rs:321,329,336 | ReplicaLagMonitor reads database replica lag from a hosted admin API | Used by',
      '  wait_for_replication |',
    ].join('\n')

    const blocks = getCachedMarkdownRenderBlocks(content, 'dark', null)

    expect(blocks.map(block => block.type)).toEqual(['ansi', 'table'])
    expect(blocks[1]).toMatchObject({
      type: 'table',
    })
    if (blocks[1]?.type !== 'table') {
      throw new Error('expected repaired markdown table block')
    }
    expect(blocks[1].token.header.map(cell => cell.text)).toEqual([
      'System',
      'Local Behavior',
      'Hosted Behavior',
      'Impact',
    ])
    expect(blocks[1].token.rows).toHaveLength(2)
    expect(blocks[1].token.rows[0]?.[3]?.text).toContain(
      'Services cannot run partitioned',
    )
    expect(blocks[1].token.rows[1]?.[3]?.text).toContain(
      'wait_for_replication',
    )
  })

  test('fuzzes malformed pipe-table repair across delimiter widths and wrapped rows', () => {
    for (const columnCount of [3, 4, 5, 6]) {
      for (const delimiterCount of [1, 2]) {
        const { headers, content } = makeMalformedPipeTableCase(
          columnCount,
          delimiterCount,
        )
        const repaired = repairMalformedPipeTables(content)
        const blocks = getCachedMarkdownRenderBlocks(content, 'dark', null)

        expect(repaired).toContain(
          `|${Array.from({ length: columnCount }, () => '---').join('|')}|`,
        )
        expect(blocks.map(block => block.type)).toEqual(['table'])
        if (blocks[0]?.type !== 'table') {
          throw new Error(`expected table for ${columnCount}/${delimiterCount}`)
        }
        expect(blocks[0].token.header.map(cell => cell.text)).toEqual(headers)
        expect(blocks[0].token.rows).toHaveLength(2)
        expect(blocks[0].token.rows[0]).toHaveLength(columnCount)
        expect(blocks[0].token.rows[1]).toHaveLength(columnCount)
        expect(blocks[0].token.rows[0]?.[columnCount - 1]?.text).toBe(
          `R1C${columnCount}`,
        )
        expect(blocks[0].token.rows[1]?.[columnCount - 1]?.text).toBe(
          `R2C${columnCount}`,
        )
      }
    }
  })

  test('leaves valid pipe tables unchanged', () => {
    const content = [
      '| A | B | C |',
      '|---|---|---|',
      '| a | b | c |',
    ].join('\n')

    expect(repairMalformedPipeTables(content)).toBe(content)
  })

  test('does not infer tables when the header is not a pipe-table row', () => {
    const content = [
      'A | B | C',
      '|---|---|',
      '| a | b',
      ' c |',
    ].join('\n')

    const blocks = getCachedMarkdownRenderBlocks(content, 'dark', null)

    expect(repairMalformedPipeTables(content)).toBe(content)
    expect(blocks.map(block => block.type)).toEqual(['ansi'])
  })

  test('does not repair pipe-like content inside fenced code blocks', () => {
    const content = [
      '```',
      '| A | B | C |',
      '|---|---|',
      '| a | b',
      ' c |',
      '```',
    ].join('\n')

    const repaired = repairMalformedPipeTables(content)
    const blocks = getCachedMarkdownRenderBlocks(content, 'dark', null)

    expect(repaired).toBe(content)
    expect(blocks.map(block => block.type)).toEqual(['code'])
  })
})
