import { afterEach, describe, expect, test } from 'bun:test'
import React from 'react'
import { PassThrough } from 'stream'
import stripAnsi from 'strip-ansi'
import { createRoot, type Root } from '../ink/root.js'
import { AppStateProvider, getDefaultAppState } from '../state/AppState.js'
import {
  applyMarkdown,
  detectPreformattedMarkdownSegments,
} from '../utils/markdown.js'
import { Markdown, getCachedMarkdownRenderBlocks, StreamingMarkdown } from './Markdown.js'

type FakeInput = PassThrough &
  NodeJS.ReadStream & {
    isTTY: boolean
    isRaw: boolean
    setRawMode: (raw: boolean) => void
    ref: () => FakeInput
    unref: () => FakeInput
  }

type FakeOutput = PassThrough &
  NodeJS.WriteStream & {
    isTTY: boolean
    columns: number
    rows: number
    getWindowSize: () => [number, number]
  }

let liveRoot: Root | null = null

afterEach(async () => {
  if (liveRoot) {
    liveRoot.unmount()
    liveRoot = null
  }
  await Bun.sleep(0)
})

function createFakeInput(): FakeInput {
  const stdin = new PassThrough() as FakeInput
  stdin.isTTY = true
  stdin.isRaw = false
  stdin.setRawMode = (raw: boolean) => {
    stdin.isRaw = raw
  }
  stdin.ref = () => stdin
  stdin.unref = () => stdin
  return stdin
}

function createFakeOutput(columns: number, rows: number): FakeOutput {
  const stdout = new PassThrough() as FakeOutput
  stdout.isTTY = true
  stdout.columns = columns
  stdout.rows = rows
  stdout.getWindowSize = () => [columns, rows]
  return stdout
}

async function waitFor(
  predicate: () => boolean,
  message: string,
  timeoutMs = 1500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await Bun.sleep(10)
  }
  throw new Error(message)
}

async function renderComponent(node: React.ReactNode): Promise<string> {
  let output = ''
  const stdout = createFakeOutput(140, 32)
  const stderr = createFakeOutput(140, 32)
  stdout.on('data', chunk => {
    output += chunk.toString()
  })

  liveRoot = await createRoot({
    stdout,
    stdin: createFakeInput(),
    stderr,
    exitOnCtrlC: false,
    patchConsole: false,
  })
  liveRoot.render(
    <AppStateProvider initialState={getDefaultAppState()}>
      {node}
    </AppStateProvider>,
  )
  await waitFor(() => output.length > 0, 'markdown component never produced output')
  const normalized = stripAnsi(output).replace(/\r/g, '')
  liveRoot.unmount()
  liveRoot = null
  await Bun.sleep(0)
  return normalized
}

function createRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function pick<T>(rng: () => number, values: T[]): T {
  return values[Math.floor(rng() * values.length)] as T
}

type MarkdownRobustnessCase = {
  name: string
  content: string
  visibleToken: string
  hiddenTokens: string[]
  diagramProbes: string[]
  codeProbes: string[]
}

type MarkdownMalformedCase = {
  name: string
  content: string
  visibleTokens: string[]
  hiddenTokens: string[]
  diagramProbes: string[]
  codeProbes: string[]
}

function makeDiagram(seed: number, index: number): {
  content: string
  probes: string[]
} {
  const service = `Service_${seed}_${index}`
  const downstream = `Store_${seed}_${index}`
  return {
    content: [
      `diagram source ${seed}_${index} ──events──► collector`,
      '                                      │',
      '',
      '                           ────────────────────',
      `                            │  ${service.padEnd(18)}│`,
      '                            │  (metrics, traces)   │',
      '                            └────────────────────',
      '                                      │',
      '                           ────────────────────',
      `                            │  ${downstream.padEnd(18)}│`,
      '                            └────────────────────',
    ].join('\n'),
    probes: [service, downstream],
  }
}

function makeFence(seed: number, index: number): {
  content: string
  probe: string
} {
  const probe = `export const seed_${seed}_${index} = ${seed + index}`
  return {
    content: ['```ts', probe, '```'].join('\n'),
    probe,
  }
}

function generateCase(seed: number): MarkdownRobustnessCase {
  const rng = createRng(seed)
  const visibleToken = `VISIBLE_SENTINEL_${seed}`
  const hiddenTokens: string[] = []
  const diagramProbes: string[] = []
  const codeProbes: string[] = []

  const segments: string[] = [
    `# Case ${seed}`,
    '',
    `Visible token: ${visibleToken}`,
  ]

  const count = 4 + Math.floor(rng() * 3)
  const kinds = [
    'paragraph',
    'list',
    'table',
    'fence',
    'diagram',
    'hidden_system',
    'hidden_abort',
  ] as const

  for (let index = 0; index < count; index += 1) {
    const kind = pick(rng, kinds)
    switch (kind) {
      case 'paragraph':
        segments.push(
          '',
          `Prose paragraph ${seed}_${index} with client -> api arrows and ordinary text.`,
        )
        break
      case 'list':
        segments.push(
          '',
          `- bullet_${seed}_${index}`,
          `- continuation_${seed}_${index}`,
        )
        break
      case 'table':
        segments.push(
          '',
          '| Current | Target | Status |',
          '|---------|--------|--------|',
          `| trigger_${seed}_${index} | routine_${seed}_${index} | pending |`,
        )
        break
      case 'fence': {
        const fence = makeFence(seed, index)
        codeProbes.push(fence.probe)
        segments.push('', fence.content)
        break
      }
      case 'diagram': {
        const diagram = makeDiagram(seed, index)
        diagramProbes.push(...diagram.probes)
        segments.push('', diagram.content)
        break
      }
      case 'hidden_system': {
        const hidden = `HIDDEN_SYSTEM_${seed}_${index}`
        hiddenTokens.push(hidden)
        segments.push(
          '',
          '<system-reminder>',
          hidden,
          '</system-reminder>',
        )
        break
      }
      case 'hidden_abort': {
        const hidden = `HIDDEN_ABORT_${seed}_${index}`
        hiddenTokens.push(hidden)
        segments.push(
          '',
          '<turn_aborted>',
          hidden,
          '</turn_aborted>',
        )
        break
      }
    }
  }

  return {
    name: `seed-${seed}`,
    content: segments.join('\n'),
    visibleToken,
    hiddenTokens,
    diagramProbes,
    codeProbes,
  }
}

const ROBUSTNESS_CASES = Array.from({ length: 8 }, (_, index) =>
  generateCase(index + 1),
)

function buildTruncatedVariants(
  testCase: MarkdownRobustnessCase,
): MarkdownMalformedCase[] {
  const visibleEnd =
    testCase.content.indexOf(testCase.visibleToken) + testCase.visibleToken.length
  if (visibleEnd <= 0 || visibleEnd >= testCase.content.length - 1) {
    return []
  }

  const remaining = testCase.content.length - visibleEnd
  const cuts = [
    visibleEnd + Math.max(1, Math.floor(remaining * 0.33)),
    visibleEnd + Math.max(1, Math.floor(remaining * 0.66)),
  ]

  return cuts
    .filter(cut => cut > visibleEnd && cut < testCase.content.length)
    .map((cut, index) => ({
      name: `${testCase.name}-truncated-${index + 1}`,
      content: testCase.content.slice(0, cut),
      visibleTokens: [testCase.visibleToken],
      hiddenTokens: testCase.hiddenTokens,
      diagramProbes: testCase.diagramProbes.filter(
        probe => testCase.content.indexOf(probe) >= 0 && cut > testCase.content.indexOf(probe),
      ),
      codeProbes: testCase.codeProbes.filter(
        probe => testCase.content.indexOf(probe) >= 0 && cut > testCase.content.indexOf(probe),
      ),
    }))
}

const MALFORMED_CASES: MarkdownMalformedCase[] = [
  {
    name: 'unclosed-fence',
    content: [
      '# Malformed fence',
      '',
      'Visible token: MALFORMED_VISIBLE_FENCE',
      '',
      '```ts',
      'const malformedFence = true',
      'const fenceTailVisible = "yes"',
    ].join('\n'),
    visibleTokens: ['MALFORMED_VISIBLE_FENCE'],
    hiddenTokens: [],
    diagramProbes: [],
    codeProbes: ['const malformedFence = true', 'const fenceTailVisible = "yes"'],
  },
  {
    name: 'dangling-formatting-and-link',
    content: [
      '**Broken emphasis starts here',
      '',
      'Visible token: MALFORMED_VISIBLE_FORMATTING',
      '',
      '[broken link target](https://example.com',
      '',
      '- list tail survives',
    ].join('\n'),
    visibleTokens: ['MALFORMED_VISIBLE_FORMATTING', 'list tail survives'],
    hiddenTokens: [],
    diagramProbes: [],
    codeProbes: [],
  },
  {
    name: 'diagram-with-broken-tail',
    content: [
      'Visible token: MALFORMED_VISIBLE_DIAGRAM',
      '',
      'service-a ──events──► service-b',
      '                         │',
      '',
      '              ────────────────────',
      '               │  DiagramProbeA     │',
      '               │  DiagramProbeB     │',
      '               └────────────────────',
      '',
      '```',
    ].join('\n'),
    visibleTokens: ['MALFORMED_VISIBLE_DIAGRAM'],
    hiddenTokens: [],
    diagramProbes: ['DiagramProbeA', 'DiagramProbeB'],
    codeProbes: [],
  },
  {
    name: 'dangling-system-reminder',
    content: [
      'Visible token: MALFORMED_VISIBLE_SYSTEM',
      '',
      '<system-reminder>',
      'HIDDEN_SYSTEM_DANGLING',
      'still hidden after malformed open tag',
    ].join('\n'),
    visibleTokens: ['MALFORMED_VISIBLE_SYSTEM'],
    hiddenTokens: ['HIDDEN_SYSTEM_DANGLING'],
    diagramProbes: [],
    codeProbes: [],
  },
  {
    name: 'stray-turn-aborted-close',
    content: [
      'Visible token: MALFORMED_VISIBLE_ABORT',
      '',
      '</turn_aborted>',
      '',
      '| almost | table | row |',
      '| but | separator | missing |',
    ].join('\n'),
    visibleTokens: ['MALFORMED_VISIBLE_ABORT', 'almost', 'separator'],
    hiddenTokens: [],
    diagramProbes: [],
    codeProbes: [],
  },
  {
    name: 'malformed-table-and-list',
    content: [
      '# MALFORMED_VISIBLE_TABLE_LIST',
      '',
      '| Name | Status | Notes |',
      '| broken | separator | only',
      '| row | with | extra | cell |',
      '',
      '- list root',
      '  - nested item',
      '    - over-indented child',
      ' - misaligned bullet',
    ].join('\n'),
    visibleTokens: [
      'MALFORMED_VISIBLE_TABLE_LIST',
      'broken',
      'extra',
      'over-indented child',
      'misaligned bullet',
    ],
    hiddenTokens: [],
    diagramProbes: [],
    codeProbes: [],
  },
  {
    name: 'mixed-width-unicode',
    content: [
      '# MIXED_WIDTH_VISIBLE',
      '',
      'Emoji probe: 🚀✨',
      'CJK probe: 例子 系统',
      'Combining probe: Cafe\u0301 nai\u0308ve',
      'ZWJ probe: 👩‍💻 platform',
      '',
      '- bullet 🚀 例子 Cafe\u0301',
    ].join('\n'),
    visibleTokens: [
      'MIXED_WIDTH_VISIBLE',
      '🚀✨',
      '例子 系统',
      'Cafe\u0301 nai\u0308ve',
      '👩‍💻 platform',
      'bullet 🚀 例子 Cafe\u0301',
    ],
    hiddenTokens: [],
    diagramProbes: [],
    codeProbes: [],
  },
  {
    name: 'nested-blockquote-and-tabs',
    content: [
      '# BLOCKQUOTE_VISIBLE',
      '',
      '> outer quote',
      '> > nested quote',
      '>\t tabbed quote tail',
      '',
      '\t- tab-indented bullet',
      '\t\t1. nested numbered item',
      'Visible tail after blockquote',
    ].join('\n'),
    visibleTokens: [
      'BLOCKQUOTE_VISIBLE',
      'outer quote',
      'nested quote',
      'tabbed quote tail',
      'tab-indented bullet',
      'nested numbered item',
      'Visible tail after blockquote',
    ],
    hiddenTokens: [],
    diagramProbes: [],
    codeProbes: [],
  },
]

const TRUNCATED_CASES = ROBUSTNESS_CASES.flatMap(buildTruncatedVariants)

function makeCombinationCases(): MarkdownMalformedCase[] {
  const fencedDiagram = [
    '```text',
    'ncode client ──events──► platform-api ──► OpenTelemetry Collector',
    '                                                │',
    '',
    '                                     ────────────────────',
    '                                      │  DiagramNodeA       │',
    '                                      │  DiagramNodeB       │',
    '                                      └────────────────────',
    '```',
  ].join('\n')

  return [
    {
      name: 'combo-fenced-diagram-then-table',
      content: [
        '# COMBO_VISIBLE_FENCE_TABLE',
        '',
        'Intro prose before the architecture block.',
        '',
        fencedDiagram,
        '',
        '| Target | Scheduler | Status |',
        '|--------|-----------|--------|',
        '| BYOK | GKE | active |',
      ].join('\n'),
      visibleTokens: [
        'COMBO_VISIBLE_FENCE_TABLE',
        'Target',
        'Scheduler',
        'active',
      ],
      hiddenTokens: [],
      diagramProbes: ['DiagramNodeA', 'DiagramNodeB'],
      codeProbes: [],
    },
    {
      name: 'combo-blockquote-fence-list',
      content: [
        '# COMBO_VISIBLE_QUOTE',
        '',
        '> outer quote',
        '> > nested quote',
        '',
        '```ts',
        'export const comboProbe = "COMBO_CODE_PROBE"',
        '```',
        '',
        '- bullet one',
        '- bullet two',
      ].join('\n'),
      visibleTokens: [
        'COMBO_VISIBLE_QUOTE',
        'outer quote',
        'nested quote',
        'bullet one',
        'bullet two',
      ],
      hiddenTokens: [],
      diagramProbes: [],
      codeProbes: ['export const comboProbe = "COMBO_CODE_PROBE"'],
    },
    {
      name: 'combo-prose-diagram-fence-table',
      content: [
        '# COMBO_VISIBLE_MULTI',
        '',
        'Routine-first framing with a diagram and fenced follow-up.',
        '',
        'scheduler ──triggers──► routine store',
        '                      │',
        '',
        '           ────────────────────',
        '            │  ComboDiagramX     │',
        '            │  ComboDiagramY     │',
        '            └────────────────────',
        '',
        '```json',
        '{ "combo": "JSON_PROBE" }',
        '```',
        '',
        '| Current | Target |',
        '|---------|--------|',
        '| trigger | routine |',
      ].join('\n'),
      visibleTokens: [
        'COMBO_VISIBLE_MULTI',
        'Routine-first framing',
        'Current',
        'Target',
        'routine',
      ],
      hiddenTokens: [],
      diagramProbes: ['ComboDiagramX', 'ComboDiagramY'],
      codeProbes: ['{ "combo": "JSON_PROBE" }'],
    },
  ]
}

const COMBINATION_CASES = makeCombinationCases()

type MarkdownMatrixBlock = {
  content: string
  visibleTokens: string[]
  hiddenTokens: string[]
  diagramProbes: string[]
  codeProbes: string[]
}

function buildMatrixBlock(
  kind:
    | 'paragraph'
    | 'list'
    | 'ordered'
    | 'table'
    | 'diagram'
    | 'fence'
    | 'fencedDiagram'
    | 'blockquote'
    | 'hiddenSystem',
  seed: number,
  index: number,
): MarkdownMatrixBlock {
  switch (kind) {
    case 'paragraph': {
      const visible = `MATRIX_PARAGRAPH_${seed}_${index}`
      return {
        content: `Paragraph probe ${visible} with ordinary prose and client -> api arrows.`,
        visibleTokens: [visible],
        hiddenTokens: [],
        diagramProbes: [],
        codeProbes: [],
      }
    }
    case 'list': {
      const visible = `MATRIX_LIST_${seed}_${index}`
      return {
        content: [`- ${visible}`, `- continuation_${seed}_${index}`].join('\n'),
        visibleTokens: [visible, `continuation_${seed}_${index}`],
        hiddenTokens: [],
        diagramProbes: [],
        codeProbes: [],
      }
    }
    case 'ordered': {
      const visible = `MATRIX_ORDERED_${seed}_${index}`
      return {
        content: [`1. ${visible}`, `2. ordered_tail_${seed}_${index}`].join('\n'),
        visibleTokens: [visible, `ordered_tail_${seed}_${index}`],
        hiddenTokens: [],
        diagramProbes: [],
        codeProbes: [],
      }
    }
    case 'table': {
      const visible = `MATRIX_TABLE_${seed}_${index}`
      return {
        content: [
          '| Name | Value |',
          '|------|-------|',
          `| ${visible} | active |`,
        ].join('\n'),
        visibleTokens: [visible, 'active'],
        hiddenTokens: [],
        diagramProbes: [],
        codeProbes: [],
      }
    }
    case 'diagram': {
      const diagram = makeDiagram(seed, index)
      return {
        content: diagram.content,
        visibleTokens: [],
        hiddenTokens: [],
        diagramProbes: diagram.probes,
        codeProbes: [],
      }
    }
    case 'fence': {
      const fence = makeFence(seed, index)
      return {
        content: fence.content,
        visibleTokens: [],
        hiddenTokens: [],
        diagramProbes: [],
        codeProbes: [fence.probe],
      }
    }
    case 'fencedDiagram': {
      const diagram = makeDiagram(seed, index)
      return {
        content: ['```text', diagram.content, '```'].join('\n'),
        visibleTokens: [],
        hiddenTokens: [],
        diagramProbes: diagram.probes,
        codeProbes: [],
      }
    }
    case 'blockquote': {
      const visible = `MATRIX_QUOTE_${seed}_${index}`
      return {
        content: [`> ${visible}`, `> > quote_tail_${seed}_${index}`].join('\n'),
        visibleTokens: [visible, `quote_tail_${seed}_${index}`],
        hiddenTokens: [],
        diagramProbes: [],
        codeProbes: [],
      }
    }
    case 'hiddenSystem': {
      const visible = `MATRIX_VISIBLE_HIDDEN_${seed}_${index}`
      const hidden = `MATRIX_HIDDEN_${seed}_${index}`
      return {
        content: [visible, '<system-reminder>', hidden, '</system-reminder>'].join('\n'),
        visibleTokens: [visible],
        hiddenTokens: [hidden],
        diagramProbes: [],
        codeProbes: [],
      }
    }
  }
}

function buildCombinationMatrixCase(
  name: string,
  kinds: Array<
    | 'paragraph'
    | 'list'
    | 'ordered'
    | 'table'
    | 'diagram'
    | 'fence'
    | 'fencedDiagram'
    | 'blockquote'
    | 'hiddenSystem'
  >,
  seed: number,
): MarkdownMalformedCase {
  const blocks = kinds.map((kind, index) => buildMatrixBlock(kind, seed, index))
  return {
    name,
    content: blocks.map(block => block.content).join('\n\n'),
    visibleTokens: blocks.flatMap(block => block.visibleTokens),
    hiddenTokens: blocks.flatMap(block => block.hiddenTokens),
    diagramProbes: blocks.flatMap(block => block.diagramProbes),
    codeProbes: blocks.flatMap(block => block.codeProbes),
  }
}

const COMBINATION_MATRIX_CASES: MarkdownMalformedCase[] = [
  buildCombinationMatrixCase(
    'matrix-paragraph-fenced-diagram-table',
    ['paragraph', 'fencedDiagram', 'table'],
    31,
  ),
  buildCombinationMatrixCase(
    'matrix-blockquote-fence-list',
    ['blockquote', 'fence', 'list'],
    32,
  ),
  buildCombinationMatrixCase(
    'matrix-table-diagram-ordered',
    ['table', 'diagram', 'ordered'],
    33,
  ),
  buildCombinationMatrixCase(
    'matrix-hidden-fence-table',
    ['hiddenSystem', 'fence', 'table'],
    34,
  ),
  buildCombinationMatrixCase(
    'matrix-fenced-diagram-list-blockquote',
    ['fencedDiagram', 'list', 'blockquote'],
    35,
  ),
  buildCombinationMatrixCase(
    'matrix-diagram-fence-table',
    ['diagram', 'fence', 'table'],
    36,
  ),
]

describe('Markdown robustness corpus', () => {
  test('preserves segmentation and helper-path invariants across generated corpus', () => {
    for (const testCase of ROBUSTNESS_CASES) {
      const segments = detectPreformattedMarkdownSegments(testCase.content)
      expect(segments.map(segment => segment.content).join('')).toBe(
        testCase.content,
      )

      const rendered = stripAnsi(applyMarkdown(testCase.content, 'dark', null))
      expect(rendered).toContain(testCase.visibleToken)
      for (const hidden of testCase.hiddenTokens) {
        expect(rendered).not.toContain(hidden)
      }
      expect(rendered).not.toContain('<system-reminder>')
      expect(rendered).not.toContain('<turn_aborted>')

      const blocks = getCachedMarkdownRenderBlocks(testCase.content, 'dark', null)
      expect(blocks.length).toBeGreaterThan(0)
    }
  })

  test('renders generated corpus through mounted Markdown and StreamingMarkdown gracefully', async () => {
    for (const testCase of ROBUSTNESS_CASES) {
      const rendered = await renderComponent(
        <Markdown>{testCase.content}</Markdown>,
      )
      const streamed = await renderComponent(
        <StreamingMarkdown>{testCase.content}</StreamingMarkdown>,
      )

      for (const output of [rendered, streamed]) {
        expect(output).toContain(testCase.visibleToken)
        expect(output).not.toContain('<system-reminder>')
        expect(output).not.toContain('<turn_aborted>')
        expect(output).not.toContain('HIDDEN_SYSTEM_')
        expect(output).not.toContain('HIDDEN_ABORT_')

        for (const probe of testCase.diagramProbes) {
          expect(output).toContain(probe)
        }
        for (const probe of testCase.codeProbes) {
          expect(output).toContain(probe)
        }
      }
    }
  })

  test('handles malformed deterministic corpus gracefully across helper and mounted paths', async () => {
    for (const testCase of MALFORMED_CASES) {
      const segments = detectPreformattedMarkdownSegments(testCase.content)
      expect(segments.map(segment => segment.content).join('')).toBe(
        testCase.content,
      )

      const helperRendered = stripAnsi(applyMarkdown(testCase.content, 'dark', null))
      const markdownRendered = await renderComponent(
        <Markdown>{testCase.content}</Markdown>,
      )
      const streamingRendered = await renderComponent(
        <StreamingMarkdown>{testCase.content}</StreamingMarkdown>,
      )

      for (const output of [helperRendered, markdownRendered, streamingRendered]) {
        expect(output.trim().length).toBeGreaterThan(0)
        expect(output).not.toContain('<system-reminder>')
        expect(output).not.toContain('<turn_aborted>')

        for (const visible of testCase.visibleTokens) {
          expect(output).toContain(visible)
        }
        for (const hidden of testCase.hiddenTokens) {
          expect(output).not.toContain(hidden)
        }
        for (const probe of testCase.diagramProbes) {
          expect(output).toContain(probe)
        }
        for (const probe of testCase.codeProbes) {
          expect(output).toContain(probe)
        }
      }
    }
  })

  test('handles deterministic truncation variants gracefully across helper and mounted paths', async () => {
    for (const testCase of TRUNCATED_CASES) {
      const segments = detectPreformattedMarkdownSegments(testCase.content)
      expect(segments.map(segment => segment.content).join('')).toBe(
        testCase.content,
      )

      const helperRendered = stripAnsi(applyMarkdown(testCase.content, 'dark', null))
      const markdownRendered = await renderComponent(
        <Markdown>{testCase.content}</Markdown>,
      )
      const streamingRendered = await renderComponent(
        <StreamingMarkdown>{testCase.content}</StreamingMarkdown>,
      )

      for (const output of [helperRendered, markdownRendered, streamingRendered]) {
        expect(output.trim().length).toBeGreaterThan(0)
        expect(output).not.toContain('<system-reminder>')
        expect(output).not.toContain('<turn_aborted>')

        for (const visible of testCase.visibleTokens) {
          expect(output).toContain(visible)
        }
        for (const hidden of testCase.hiddenTokens) {
          expect(output).not.toContain(hidden)
        }
        for (const probe of testCase.diagramProbes) {
          expect(output).toContain(probe)
        }
        for (const probe of testCase.codeProbes) {
          expect(output).toContain(probe)
        }
      }
    }
  })

  test('handles deterministic composed markdown combinations across helper and mounted paths', async () => {
    for (const testCase of COMBINATION_CASES) {
      const segments = detectPreformattedMarkdownSegments(testCase.content)
      expect(segments.map(segment => segment.content).join('')).toBe(
        testCase.content,
      )

      const helperRendered = stripAnsi(applyMarkdown(testCase.content, 'dark', null))
      const markdownRendered = await renderComponent(
        <Markdown>{testCase.content}</Markdown>,
      )
      const streamingRendered = await renderComponent(
        <StreamingMarkdown>{testCase.content}</StreamingMarkdown>,
      )

      for (const output of [helperRendered, markdownRendered, streamingRendered]) {
        expect(output.trim().length).toBeGreaterThan(0)
        expect(output).not.toContain('```')

        for (const visible of testCase.visibleTokens) {
          expect(output).toContain(visible)
        }
        for (const hidden of testCase.hiddenTokens) {
          expect(output).not.toContain(hidden)
        }
        for (const probe of testCase.diagramProbes) {
          expect(output).toContain(probe)
        }
        for (const probe of testCase.codeProbes) {
          expect(output).toContain(probe)
        }
      }
    }
  })

  test('handles deterministic markdown combination matrix across helper and mounted paths', async () => {
    for (const testCase of COMBINATION_MATRIX_CASES) {
      const segments = detectPreformattedMarkdownSegments(testCase.content)
      expect(segments.map(segment => segment.content).join('')).toBe(
        testCase.content,
      )

      const helperRendered = stripAnsi(applyMarkdown(testCase.content, 'dark', null))
      const markdownRendered = await renderComponent(
        <Markdown>{testCase.content}</Markdown>,
      )
      const streamingRendered = await renderComponent(
        <StreamingMarkdown>{testCase.content}</StreamingMarkdown>,
      )

      for (const output of [helperRendered, markdownRendered, streamingRendered]) {
        expect(output.trim().length).toBeGreaterThan(0)
        expect(output).not.toContain('```')

        for (const visible of testCase.visibleTokens) {
          expect(output).toContain(visible)
        }
        for (const hidden of testCase.hiddenTokens) {
          expect(output).not.toContain(hidden)
        }
        for (const probe of testCase.diagramProbes) {
          expect(output).toContain(probe)
        }
        for (const probe of testCase.codeProbes) {
          expect(output).toContain(probe)
        }
      }
    }
  })
})
