import { writeFile } from 'node:fs/promises'
import {
  REPL_PERF_SCENARIO_IDS,
  runReplPerfScenario,
  type ReplPerfScenarioId,
} from './replPerfScenarios.js'

function usage(): never {
  const supported = REPL_PERF_SCENARIO_IDS.join('|')
  console.error(`Usage: bun src/ink/replPerfProfile.tsx <${supported}>`)
  process.exit(1)
}

function parseScenario(argv: string[]): ReplPerfScenarioId {
  const [scenario] = argv
  if (
    !scenario ||
    !(REPL_PERF_SCENARIO_IDS as readonly string[]).includes(scenario)
  ) {
    usage()
  }
  return scenario as ReplPerfScenarioId
}

const scenario = parseScenario(process.argv.slice(2))
const result = await runReplPerfScenario(scenario)
const payload = {
  scenario,
  summary: result.summary,
}

if (process.env.NCODE_REPL_PROFILE_SUMMARY) {
  await writeFile(
    process.env.NCODE_REPL_PROFILE_SUMMARY,
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8',
  )
}

console.log(JSON.stringify(payload, null, 2))
