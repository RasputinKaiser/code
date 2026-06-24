import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import {
  collectOpenAICompatReplayEvents,
  deriveOpenAICompatReplayCreateMessageParams,
  extractOpenAICompatReplayReceiptsFromDumpPrompts,
  summarizeOpenAICompatDumpPromptsRequestShape,
} from '../src/services/api/openAICompatInferenceReceiptReplay.ts'

function printUsage() {
  console.error(
    [
      'Usage:',
      '  bun build/openAICompatReceiptReplay.mjs <dump-prompts.jsonl>',
      '  bun build/openAICompatReceiptReplay.mjs --shape <dump-prompts.jsonl> [other.jsonl ...]',
      '',
      'Replays each streamed response in a dump-prompts JSONL file through the',
      'real OpenAICompatInferenceClient reducer path.',
      '',
      'Use --shape to print a request-shape summary and, when multiple files are',
      'provided, a structured diff of the client-visible init/message surface.',
    ].join('\n'),
  )
}

function buildShapeDiff(baseSummary, compareSummary) {
  const diff = {}
  const keys = new Set([
    ...Object.keys(baseSummary),
    ...Object.keys(compareSummary),
  ])

  for (const key of [...keys].sort()) {
    if (key === 'source_path') continue
    const left = JSON.stringify(baseSummary[key])
    const right = JSON.stringify(compareSummary[key])
    if (left !== right) {
      diff[key] = {
        left: baseSummary[key],
        right: compareSummary[key],
      }
    }
  }

  return diff
}

function summarizeReplayEvents(events) {
  let toolUseBlocks = 0
  let textBlocks = 0
  let thinkingBlocks = 0
  let stopReason = null

  for (const event of events) {
    if (event.type === 'content_block_start' && event.content_block) {
      if (event.content_block.type === 'tool_use') toolUseBlocks += 1
      if (event.content_block.type === 'text') textBlocks += 1
      if (event.content_block.type === 'thinking') thinkingBlocks += 1
    }
    if (event.type === 'message_delta' && event.delta?.stop_reason) {
      stopReason = event.delta.stop_reason
    }
  }

  return {
    event_count: events.length,
    tool_use_blocks: toolUseBlocks,
    text_blocks: textBlocks,
    thinking_blocks: thinkingBlocks,
    stop_reason: stopReason,
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage()
    process.exit(args.length > 0 ? 0 : 1)
  }

  if (args[0] === '--shape') {
    const dumpPaths = args.slice(1).map((dumpPathArg) => resolve(dumpPathArg))
    if (dumpPaths.length === 0) {
      printUsage()
      process.exit(1)
    }

    const summaries = dumpPaths.map((dumpPath) => {
      const raw = readFileSync(dumpPath, 'utf8')
      const parsed = extractOpenAICompatReplayReceiptsFromDumpPrompts(raw, dumpPath)
      return summarizeOpenAICompatDumpPromptsRequestShape(parsed, dumpPath)
    })

    for (const summary of summaries) {
      console.log(JSON.stringify(summary, null, 2))
    }

    if (summaries.length >= 2) {
      const [baseSummary, ...rest] = summaries
      for (const summary of rest) {
        console.log(
          JSON.stringify(
            {
              compare: {
                left: baseSummary.source_path,
                right: summary.source_path,
              },
              diff: buildShapeDiff(baseSummary, summary),
            },
            null,
            2,
          ),
        )
      }
    }
    return
  }

  const [dumpPathArg] = args
  const dumpPath = resolve(dumpPathArg)
  const raw = readFileSync(dumpPath, 'utf8')
  const parsed = extractOpenAICompatReplayReceiptsFromDumpPrompts(raw, dumpPath)

  if (parsed.receipts.length === 0) {
    console.error(`No streamed response receipts found in ${dumpPath}`)
    process.exit(1)
  }

  console.log(`receipt_file=${basename(dumpPath)}`)
  console.log(`streamed_responses=${parsed.receipts.length}`)

  let failureCount = 0

  for (const receipt of parsed.receipts) {
    const params = deriveOpenAICompatReplayCreateMessageParams(parsed.init, receipt)
    try {
      const replay = await collectOpenAICompatReplayEvents(receipt, params)
      const summary = summarizeReplayEvents(replay.events)
      console.log(
        JSON.stringify(
          {
            response_index: receipt.source_response_index,
            status: 'ok',
            request_id: replay.request_id,
            summary,
          },
          null,
          2,
        ),
      )
    } catch (error) {
      failureCount += 1
      console.log(
        JSON.stringify(
          {
            response_index: receipt.source_response_index,
            status: 'error',
            error:
              error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        ),
      )
    }
  }

  if (failureCount > 0) {
    process.exit(1)
  }
}

await main()
