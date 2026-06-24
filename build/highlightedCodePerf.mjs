import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rerunsFlagIndex = process.argv.indexOf('--reruns')
const reruns =
  rerunsFlagIndex >= 0
    ? Number.parseInt(process.argv[rerunsFlagIndex + 1] ?? '3', 10)
    : 3

if (!Number.isFinite(reruns) || reruns <= 0) {
  throw new Error(`invalid rerun count: ${process.argv[rerunsFlagIndex + 1]}`)
}

const { runHighlightedCodeMountScenario } = await import(
  '../src/ink/highlightedCodePerfScenarios.tsx'
)
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))

const results = []
for (let run = 0; run < reruns; run += 1) {
  results.push(await runHighlightedCodeMountScenario())
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

function summarize(label, summaries) {
  return {
    scenario: label,
    reruns: summaries.length,
    frames: percentile(summaries.map(summary => summary.frames), 0.95),
    totalBytes: percentile(summaries.map(summary => summary.totalBytes), 0.95),
    maxBytes: percentile(summaries.map(summary => summary.maxBytes), 0.95),
    totalDurationMs: percentile(
      summaries.map(summary => summary.totalDurationMs),
      0.95,
    ),
    maxDurationMs: percentile(
      summaries.map(summary => summary.maxDurationMs),
      0.95,
    ),
    maxMeasured: percentile(
      summaries.map(summary => summary.maxMeasured),
      0.95,
    ),
    maxVisited: percentile(
      summaries.map(summary => summary.maxVisited),
      0.95,
    ),
    totalPatches: percentile(
      summaries.map(summary => summary.totalPatches),
      0.95,
    ),
    maxPatches: percentile(
      summaries.map(summary => summary.maxPatches),
      0.95,
    ),
    flickerFrames: percentile(
      summaries.map(summary => summary.flickerFrames),
      0.95,
    ),
  }
}

const summary = {
  reruns,
  explicitWidthColdMount: summarize(
    'highlighted-code explicit-width cold mount',
    results.map(result => result.explicitWidthColdSummary),
  ),
  explicitWidthRemount: summarize(
    'highlighted-code explicit-width remount',
    results.map(result => result.explicitWidthRemountSummary),
  ),
  implicitWidthColdMount: summarize(
    'highlighted-code implicit-width cold mount',
    results.map(result => result.implicitWidthColdSummary),
  ),
  runs: results,
}

const tmpRoot = process.env.TMPDIR ?? join(repoRoot, '.tmp')
mkdirSync(tmpRoot, { recursive: true })
const outDir = mkdtempSync(join(tmpRoot, 'highlighted-code-perf-'))
const outPath = join(outDir, 'summary.json')
writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`)

console.log(`Summary written to ${outPath}`)
console.log(JSON.stringify(summary, null, 2))
