import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const buildDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(buildDir, '..')
const runnerFile = path.join(rootDir, 'src', 'ink', 'replPerfProfile.tsx')
const artifactRoot = path.join(rootDir, '.tmp', 'repl-profiles')

function usage() {
  console.log(`Usage: bun build/replProfile.mjs <cpu|heap> <prompt|search|assistant|scroll> [--cleanup]

Examples:
  bun build/replProfile.mjs cpu prompt
  bun build/replProfile.mjs heap scroll --cleanup`)
}

function parseArgs(argv) {
  const [kind, scenario, ...rest] = argv
  if (!kind || !scenario || kind === '--help' || kind === '-h') {
    usage()
    process.exit(kind ? 0 : 1)
  }

  if (!['cpu', 'heap'].includes(kind)) {
    throw new Error(`Unknown profile kind: ${kind}`)
  }

  if (
    !['prompt', 'search', 'assistant', 'scroll', 'long-history'].includes(
      scenario,
    )
  ) {
    throw new Error(`Unknown REPL perf scenario: ${scenario}`)
  }

  let cleanupArtifacts = false
  for (const arg of rest) {
    if (arg === '--cleanup') {
      cleanupArtifacts = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      usage()
      process.exit(0)
    }
    throw new Error(`Unknown flag: ${arg}`)
  }

  return { kind, scenario, cleanupArtifacts }
}

function profileFlag(kind) {
  return kind === 'cpu' ? '--cpu-prof' : '--heap-prof'
}

function profileDirFlag(kind) {
  return kind === 'cpu' ? '--cpu-prof-dir' : '--heap-prof-dir'
}

async function listProfileArtifacts(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name => name !== 'summary.json')
    .sort()
}

const { kind, scenario, cleanupArtifacts } = parseArgs(process.argv.slice(2))

await mkdir(artifactRoot, { recursive: true })
const artifactDir = await mkdtemp(
  path.join(artifactRoot, `${scenario}-${kind}-`),
)
const tmpDir = path.join(artifactDir, 'tmp')
await mkdir(tmpDir, { recursive: true })
const summaryPath = path.join(artifactDir, 'summary.json')
const profileDirArg = path.relative(rootDir, artifactDir) || '.'

const cmd = [
  process.execPath,
  profileFlag(kind),
  profileDirFlag(kind),
  profileDirArg,
  runnerFile,
  scenario,
]

console.log(`Running ${kind} profile for ${scenario}`)
console.log(`  ${cmd.join(' ')}`)

try {
  const proc = Bun.spawn({
    cmd,
    cwd: rootDir,
    stdout: 'inherit',
    stderr: 'inherit',
    env: {
      ...process.env,
      TMPDIR: process.env.TMPDIR ?? tmpDir,
      NCODE_REPL_PROFILE_SUMMARY: summaryPath,
    },
  })

  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`${kind} profile for ${scenario} failed with exit code ${exitCode}`)
  }

  const [summaryRaw, profileFiles] = await Promise.all([
    readFile(summaryPath, 'utf8'),
    listProfileArtifacts(artifactDir),
  ])

  console.log('\nREPL profile artifacts')
  console.log(`  artifacts: ${artifactDir}`)
  console.log(`  summary:   ${summaryPath}`)
  if (profileFiles.length === 0) {
    console.log('  profiles:  none emitted')
  } else {
    for (const file of profileFiles) {
      console.log(`  profile:   ${path.join(artifactDir, file)}`)
    }
  }

  console.log('\nSummary')
  console.log(summaryRaw.trim())
} finally {
  if (cleanupArtifacts) {
    await rm(artifactDir, { recursive: true, force: true })
  }
}
