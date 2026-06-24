import axios from 'axios'
import { execa } from 'execa'
import { readFile } from 'fs/promises'
import { join } from 'path'
import z from 'zod/v4'
import { OAUTH_BETA_HEADER } from '../constants/oauth.js'
import type { Message } from '../types/message.js'
import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import { getCwd } from '../utils/cwd.js'
import { logForDebugging } from '../utils/debug.js'
import { getUserAgent } from '../utils/http.js'
import {
  extractTextContent,
  getAssistantMessageText,
  getUserMessageText,
} from '../utils/messages.js'
import { getSmallFastModel } from '../utils/model/model.js'
import { getAPIProvider } from '../utils/model/providers.js'
import { buildNoumenaPlatformUrl } from '../utils/platformUrls.js'
import { isEssentialTrafficOnly } from '../utils/privacyLevel.js'
import { sideQuery } from '../utils/sideQuery.js'
import { zodToJsonSchema } from '../utils/zodToJsonSchema.js'
import { getCompanion } from './companion.js'
import type { Companion, CompanionBones, CompanionSoul } from './types.js'
import { STAT_NAMES } from './types.js'
import { getGlobalConfig } from '../utils/config.js'
import { resolveBuddyReactionSession } from './buddySession.js'

const BUDDY_REACTION_COOLDOWN_MS = 30_000
const MAX_RECENT_REACTIONS = 3
const LARGE_DIFF_THRESHOLD = 80
const BUDDY_REQUEST_TIMEOUT_MS = 10_000
const REACTION_TRANSCRIPT_WINDOW = 12
const RECENT_COMMITS_COUNT = 3
const MAX_TRANSCRIPT_CHARS = 5_000
const MAX_RECENT_REACTION_CHARS = 200
const MAX_MESSAGE_CHARS = 300
const MAX_TOOL_OUTPUT_CHARS = 1_000

const TEST_FAIL_RE =
  /\b[1-9]\d* (failed|failing)\b|\btests? failed\b|^FAIL(ED)?\b| ✗ | ✘ /im
const ERROR_RE =
  /\berror:|\bexception\b|\btraceback\b|\bpanicked at\b|\bfatal:|exit code [1-9]/i

const CompanionSoulSchema = z.strictObject({
  name: z.string().min(1).max(14),
  personality: z.string(),
})

const BUDDY_SYSTEM_PROMPT = `You generate coding companions — small creatures that live in a developer's terminal and occasionally comment on their work.

Given a rarity, species, stats, and a handful of inspiration words, invent:
- A name: ONE word, max 12 characters. Memorable, slightly absurd. No titles, no "the X", no epithets. Think pet name, not NPC name. The inspiration words are loose anchors — riff on one, mash two syllables, or just use the vibe. Examples: Pith, Dusker, Crumb, Brogue, Sprocket.
- A one-sentence personality (specific, funny, a quirk that affects how they'd comment on code — should feel consistent with the stats)

Higher rarity = weirder, more specific, more memorable. A legendary should be genuinely strange.
Don't repeat yourself — every companion should feel distinct.`

const INSPIRATION_WORDS = [
  'thunder',
  'biscuit',
  'void',
  'accordion',
  'moss',
  'velvet',
  'rust',
  'pickle',
  'crumb',
  'whisper',
  'gravy',
  'frost',
  'ember',
  'soup',
  'marble',
  'thorn',
  'honey',
  'static',
  'copper',
  'dusk',
  'sprocket',
  'bramble',
  'cinder',
  'wobble',
  'drizzle',
  'flint',
  'tinsel',
  'murmur',
  'clatter',
  'gloom',
  'nectar',
  'quartz',
  'shingle',
  'tremor',
  'umber',
  'waffle',
  'zephyr',
  'bristle',
  'dapple',
  'fennel',
  'gristle',
  'huddle',
  'kettle',
  'lumen',
  'mottle',
  'nuzzle',
  'pebble',
  'quiver',
  'ripple',
  'sable',
  'thistle',
  'vellum',
  'wicker',
  'yonder',
  'bauble',
  'cobble',
  'doily',
  'fickle',
  'gambit',
  'hubris',
  'jostle',
  'knoll',
  'larder',
  'mantle',
  'nimbus',
  'oracle',
  'plinth',
  'quorum',
  'relic',
  'spindle',
  'trellis',
  'urchin',
  'vortex',
  'warble',
  'xenon',
  'yoke',
  'zenith',
  'alcove',
  'brogue',
  'chisel',
  'dirge',
  'epoch',
  'fathom',
  'glint',
  'hearth',
  'inkwell',
  'jetsam',
  'kiln',
  'lattice',
  'mirth',
  'nook',
  'obelisk',
  'parsnip',
  'quill',
  'rune',
  'sconce',
  'tallow',
  'umbra',
  'verve',
  'wisp',
  'yawn',
  'apex',
  'brine',
  'crag',
  'dregs',
  'etch',
  'flume',
  'gable',
  'husk',
  'ingot',
  'jamb',
  'knurl',
  'loam',
  'mote',
  'nacre',
  'ogle',
  'prong',
  'quip',
  'rind',
  'slat',
  'tuft',
  'vane',
  'welt',
  'yarn',
  'bane',
  'clove',
  'dross',
  'eave',
  'fern',
  'grit',
  'hive',
  'jade',
  'keel',
  'lilt',
  'muse',
  'nape',
  'omen',
  'pith',
  'rook',
  'silt',
  'tome',
  'urge',
  'vex',
  'wane',
  'yew',
  'zest',
] as const

const FALLBACK_NAMES = [
  'Crumpet',
  'Soup',
  'Pickle',
  'Biscuit',
  'Moth',
  'Gravy',
] as const

let lastReactionAt = 0
let lastObservedMessageCount = 0
const recentReactions: string[] = []

function pickInspirationWords(seed: number, count: number): string[] {
  let state = seed >>> 0
  const seen = new Set<number>()
  while (seen.size < count) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    seen.add(state % INSPIRATION_WORDS.length)
  }
  return [...seen].map(index => INSPIRATION_WORDS[index]!)
}

function pushRecentReaction(reaction: string): void {
  recentReactions.push(reaction)
  if (recentReactions.length > MAX_RECENT_REACTIONS) {
    recentReactions.shift()
  }
}

function wasBuddyAddressed(messages: readonly Message[], name: string): boolean {
  const lastUserMessage = [...messages].findLast(
    message => message.type === 'user',
  )
  if (!lastUserMessage) {
    return false
  }
  const text = getUserMessageText(lastUserMessage) ?? ''
  return new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(
    text,
  )
}

function collectRecentToolResults(messages: readonly Message[]): string {
  const results: string[] = []

  for (const message of messages) {
    if (message.type !== 'user') {
      continue
    }

    const { content } = message.message
    if (typeof content === 'string') {
      continue
    }

    for (const block of content) {
      if (block.type !== 'tool_result') {
        continue
      }
      if (typeof block.content === 'string') {
        results.push(block.content)
        continue
      }
      if (Array.isArray(block.content)) {
        for (const item of block.content) {
          if (item.type === 'text') {
            results.push(item.text)
          }
        }
      }
    }
  }

  return results.join('\n')
}

function classifyToolResultContext(
  toolOutput: string,
): 'error' | 'large-diff' | 'test-fail' | null {
  if (!toolOutput) {
    return null
  }
  if (TEST_FAIL_RE.test(toolOutput)) {
    return 'test-fail'
  }
  if (ERROR_RE.test(toolOutput)) {
    return 'error'
  }
  if (/^(@@ |diff )/m.test(toolOutput)) {
    const changedLineCount = toolOutput.match(/^[+-](?![+-])/gm)?.length ?? 0
    if (changedLineCount > LARGE_DIFF_THRESHOLD) {
      return 'large-diff'
    }
  }
  return null
}

function buildReactionTranscript(
  messages: readonly Message[],
  toolOutput: string,
): string {
  const lines: string[] = []
  const recentMessages = messages.slice(-REACTION_TRANSCRIPT_WINDOW)

  for (const message of recentMessages) {
    if (message.type !== 'user' && message.type !== 'assistant') {
      continue
    }
    if (message.isMeta) {
      continue
    }

    const text =
      message.type === 'user'
        ? getUserMessageText(message)
        : getAssistantMessageText(message)
    if (text) {
      lines.push(
        `${message.type === 'user' ? 'user' : 'claude'}: ${text.slice(0, MAX_MESSAGE_CHARS)}`,
      )
    }
  }

  if (toolOutput) {
    lines.push(`[tool output]\n${toolOutput.slice(-MAX_TOOL_OUTPUT_CHARS)}`)
  }

  return lines.join('\n')
}

async function postBuddyReaction(
  companion: Companion,
  transcript: string,
  reason: string,
  recent: readonly string[],
  addressed: boolean,
  signal?: AbortSignal,
): Promise<string | null> {
  if (getAPIProvider() !== 'firstParty') {
    return null
  }
  if (isEssentialTrafficOnly()) {
    return null
  }

  try {
    const session = await getAuthRuntime().resolveSession({ allowRefresh: true })
    const reactionSession = resolveBuddyReactionSession(session)
    if (!reactionSession) {
      return null
    }

    const url = buildNoumenaPlatformUrl(
      `/api/organizations/${reactionSession.organizationUuid}/claude_code/buddy_react`,
    )
    const response = await axios.post<{ reaction?: string }>(
      url,
      {
        name: companion.name.slice(0, 32),
        personality: companion.personality.slice(0, 200),
        species: companion.species,
        rarity: companion.rarity,
        stats: companion.stats,
        transcript: transcript.slice(0, MAX_TRANSCRIPT_CHARS),
        reason,
        recent: recent.map(entry => entry.slice(0, MAX_RECENT_REACTION_CHARS)),
        addressed,
      },
      {
        headers: {
          Authorization: `Bearer ${reactionSession.accessToken}`,
          'anthropic-beta': OAUTH_BETA_HEADER,
          'User-Agent': getUserAgent(),
        },
        timeout: BUDDY_REQUEST_TIMEOUT_MS,
        signal,
      },
    )
    return response.data.reaction?.trim() || null
  } catch (error) {
    logForDebugging(`[buddy] api failed: ${String(error)}`)
    return null
  }
}

export function getLastCompanionReaction(): string | undefined {
  return recentReactions.at(-1)
}

export async function fireCompanionObserver(
  messages: readonly Message[],
  onReaction: (reaction: string) => void,
): Promise<void> {
  const companion = getCompanion()
  if (!companion || getGlobalConfig().companionMuted) {
    lastObservedMessageCount = messages.length
    return
  }

  const addressed = wasBuddyAddressed(messages, companion.name)
  const newToolOutput = collectRecentToolResults(messages.slice(lastObservedMessageCount))
  lastObservedMessageCount = messages.length

  const recentToolOutput = collectRecentToolResults(
    messages.slice(-REACTION_TRANSCRIPT_WINDOW),
  )
  const reason = addressed ? null : classifyToolResultContext(newToolOutput)
  const effectiveReason = reason ?? 'turn'
  const now = Date.now()

  if (!addressed && !reason && now - lastReactionAt < BUDDY_REACTION_COOLDOWN_MS) {
    return
  }

  const transcript = buildReactionTranscript(messages, recentToolOutput)
  if (!transcript.trim()) {
    return
  }

  lastReactionAt = now
  const reaction = await postBuddyReaction(
    companion,
    transcript,
    effectiveReason,
    recentReactions,
    addressed,
    AbortSignal.timeout(BUDDY_REQUEST_TIMEOUT_MS),
  )

  if (!reaction) {
    return
  }

  pushRecentReaction(reaction)
  onReaction(reaction)
}

export async function buildHatchContext(): Promise<string> {
  const cwd = getCwd()
  const results = await Promise.allSettled([
    readFile(join(cwd, 'package.json'), 'utf8'),
    execa('git', ['--no-optional-locks', 'log', '--oneline', '-n', String(RECENT_COMMITS_COUNT)], {
      cwd,
      reject: false,
    }),
  ])

  const parts: string[] = []

  const packageResult = results[0]
  if (packageResult?.status === 'fulfilled') {
    try {
      const pkg = JSON.parse(packageResult.value) as {
        description?: string
        name?: string
      }
      if (pkg.name) {
        parts.push(
          `project: ${pkg.name}${pkg.description ? ` — ${pkg.description}` : ''}`,
        )
      }
    } catch {}
  }

  const gitResult = results[1]
  if (gitResult?.status === 'fulfilled') {
    const stdout = gitResult.value.stdout.trim()
    if (stdout) {
      parts.push(`recent commits:\n${stdout}`)
    }
  }

  return parts.join('\n')
}

export async function fireHatchReaction(
  companion: Companion,
  onReaction: (reaction: string) => void,
): Promise<void> {
  if (getGlobalConfig().companionMuted) {
    return
  }

  lastReactionAt = Date.now()
  try {
    const reaction = await postBuddyReaction(
      companion,
      (await buildHatchContext()) || '(fresh project, nothing to see yet)',
      'hatch',
      [],
      false,
      AbortSignal.timeout(BUDDY_REQUEST_TIMEOUT_MS),
    )
    if (!reaction) {
      return
    }
    pushRecentReaction(reaction)
    onReaction(reaction)
  } catch {}
}

export async function firePetReaction(
  onReaction: (reaction: string) => void,
): Promise<void> {
  const companion = getCompanion()
  if (!companion) {
    return
  }

  lastReactionAt = Date.now()
  const reaction = await postBuddyReaction(
    companion,
    '(you were just petted)',
    'pet',
    recentReactions,
    false,
    AbortSignal.timeout(BUDDY_REQUEST_TIMEOUT_MS),
  )

  if (!reaction) {
    return
  }

  pushRecentReaction(reaction)
  onReaction(reaction)
}

function fallbackCompanionSoul(bones: CompanionBones): CompanionSoul {
  const seed = bones.species.charCodeAt(0) + bones.eye.charCodeAt(0)
  return {
    name: FALLBACK_NAMES[seed % FALLBACK_NAMES.length]!,
    personality: `A ${bones.rarity} ${bones.species} of few words.`,
  }
}

export async function generateCompanionSoul(
  bones: CompanionBones,
  inspirationSeed: number,
  signal?: AbortSignal,
): Promise<CompanionSoul> {
  const inspirationWords = pickInspirationWords(inspirationSeed, 4)
  const statsText = STAT_NAMES.map(name => `${name}:${bones.stats[name]}`).join(
    ' ',
  )
  const prompt = `Generate a companion.
Rarity: ${bones.rarity.toUpperCase()}
Species: ${bones.species}
Stats: ${statsText}
Inspiration words: ${inspirationWords.join(', ')}
${bones.shiny ? 'SHINY variant — extra special.' : ''}

Make it memorable and distinct.`

  try {
    const response = await sideQuery({
      querySource:
        'buddy_companion' as Parameters<typeof sideQuery>[0]['querySource'],
      model: getSmallFastModel(),
      system: BUDDY_SYSTEM_PROMPT,
      skipSystemPromptPrefix: true,
      messages: [{ role: 'user', content: prompt }],
      output_format: {
        type: 'json_schema',
        schema: zodToJsonSchema(CompanionSoulSchema),
      },
      max_tokens: 512,
      temperature: 1,
      signal,
    })
    const text = extractTextContent(response.content).trim()
    logForDebugging(`[buddy] soul response: ${text.slice(0, 200)}`)
    if (!text) {
      throw new Error(
        `no text block in response, got: ${response.content.map(block => block.type).join(',')}`,
      )
    }
    const parsed = CompanionSoulSchema.safeParse(JSON.parse(text))
    if (!parsed.success) {
      throw new Error(`schema mismatch: ${parsed.error.message}`)
    }
    return parsed.data
  } catch (error) {
    logForDebugging(`[buddy] soul generation failed: ${String(error)}`)
    return fallbackCompanionSoul(bones)
  }
}
