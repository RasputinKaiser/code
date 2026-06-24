import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

const rerunsFlagIndex = process.argv.indexOf('--reruns')
const reruns =
  rerunsFlagIndex >= 0
    ? Number.parseInt(process.argv[rerunsFlagIndex + 1] ?? '10', 10)
    : 10

if (!Number.isFinite(reruns) || reruns <= 0) {
  throw new Error(`invalid rerun count: ${process.argv[rerunsFlagIndex + 1]}`)
}

const { applyMarkdown, clearApplyMarkdownCache } = await import(
  '../src/utils/markdown.ts'
)
const { getCliHighlightPromise } = await import('../src/utils/cliHighlight.ts')

function makeLargeMarkdownPreview(lineCount = 640, lineWidth = 96) {
  const lines = Array.from(
    { length: lineCount },
    (_, line) =>
      `export const value_${line.toString(36).padStart(3, '0')} = '${`${line}`.padEnd(lineWidth, 'x')}';`,
  )
  return ['assistant summary', '', '```ts', ...lines, '```'].join('\n')
}

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * p) - 1),
  )
  return sorted[index]
}

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const highlight = await getCliHighlightPromise()
const content = makeLargeMarkdownPreview()
const coldDurations = []
const warmDurations = []

for (let run = 0; run < reruns; run += 1) {
  clearApplyMarkdownCache()

  const coldStart = performance.now()
  applyMarkdown(content, 'dark', highlight)
  coldDurations.push(performance.now() - coldStart)

  const warmStart = performance.now()
  applyMarkdown(content, 'dark', highlight)
  warmDurations.push(performance.now() - warmStart)
}

const summary = {
  reruns,
  coldMsP95: percentile(coldDurations, 0.95),
  warmMsP95: percentile(warmDurations, 0.95),
  coldMsAvg:
    coldDurations.reduce((sum, value) => sum + value, 0) / coldDurations.length,
  warmMsAvg:
    warmDurations.reduce((sum, value) => sum + value, 0) / warmDurations.length,
}

const tmpRoot = process.env.TMPDIR ?? join(repoRoot, '.tmp')
mkdirSync(tmpRoot, { recursive: true })
const outDir = mkdtempSync(join(tmpRoot, 'apply-markdown-perf-'))
const outPath = join(outDir, 'summary.json')
writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`)

console.log(`Summary written to ${outPath}`)
console.log(JSON.stringify(summary, null, 2))
