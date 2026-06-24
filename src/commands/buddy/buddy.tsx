import * as React from 'react'
import { useEffect, useState } from 'react'
import { Box, Text, useInput } from '../../ink.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import type { LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { getRainbowColor } from '../../utils/thinking.js'
import { renderSprite } from '../../buddy/sprites.js'
import { companionUserId, getCompanion, roll } from '../../buddy/companion.js'
import {
  fireHatchReaction,
  firePetReaction,
  generateCompanionSoul,
  getLastCompanionReaction,
} from '../../buddy/observer.js'
import type { Companion, CompanionBones, CompanionSoul } from '../../buddy/types.js'
import { RARITY_COLORS, RARITY_STARS, STAT_NAMES } from '../../buddy/types.js'

const HATCH_TICK_MS = 160
const HATCH_INTRO_FRAME_COUNT = 4
const HATCH_MIN_WAIT_FRAMES = 12
const HATCH_BASE_LINES = [
  '    _____    ',
  '   /     \\   ',
  '  /       \\  ',
  ' |         | ',
  '  \\       /  ',
  '   \\_____/   ',
] as const

const HATCH_FRAMES = [
  { offset: 0, lines: HATCH_BASE_LINES },
  { offset: 1, lines: HATCH_BASE_LINES },
  { offset: -1, lines: HATCH_BASE_LINES },
  { offset: 1, lines: HATCH_BASE_LINES },
  {
    offset: 0,
    lines: [
      '    _____    ',
      '   /     \\   ',
      '  /       \\  ',
      ' |    .    | ',
      '  \\       /  ',
      '   \\_____/   ',
    ],
  },
  {
    offset: -1,
    lines: [
      '    _____    ',
      '   /     \\   ',
      '  /       \\  ',
      ' |    ∕    | ',
      '  \\       /  ',
      '   \\_____/   ',
    ],
  },
  {
    offset: 1,
    lines: [
      '    _____    ',
      '   /     \\   ',
      '  /   .   \\  ',
      ' |   ∕ \\   | ',
      '  \\       /  ',
      '   \\_____/   ',
    ],
  },
  {
    offset: 0,
    lines: [
      '    _____    ',
      '   /  .  \\   ',
      '  /  ∕ \\  \\  ',
      ' |  ∕   \\  | ',
      '  \\   .   /  ',
      '   \\_____/   ',
    ],
  },
  {
    offset: -1,
    lines: [
      '    _____    ',
      '   / ∕ \\ \\   ',
      '  / ∕   \\ \\  ',
      ' | ∕     \\ | ',
      '  \\   ∨   /  ',
      '   \\__∨__/   ',
    ],
  },
  {
    offset: 1,
    lines: [
      '    __ __    ',
      '   / V V \\   ',
      '  / ∕   \\ \\  ',
      ' | ∕     \\ | ',
      '  \\   ∨   /  ',
      '   \\__∨__/   ',
    ],
  },
  {
    offset: 0,
    lines: [
      '   ·  ✦  ·   ',
      '  ·       ·  ',
      ' ·    ✦    · ',
      '  ✦       ✦  ',
      ' ·    ·    · ',
      '   ·  ✦  ·   ',
    ],
  },
] as const

const HATCH_REVEAL_FRAME_COUNT = HATCH_FRAMES.length - HATCH_INTRO_FRAME_COUNT

type CompanionCardProps = {
  companion: Companion
  lastReaction?: string
  onDone?: LocalJSXCommandOnDone
}

type HatchingProps = {
  hatching: Promise<Companion>
  onDone: LocalJSXCommandOnDone
}

type StatRowProps = {
  color: keyof typeof RARITY_COLORS
  name: (typeof STAT_NAMES)[number]
  value: number
}

async function hatchCompanion(
  bones: CompanionBones,
  inspirationSeed: number,
): Promise<Companion> {
  const soul = await generateCompanionSoul(bones, inspirationSeed)
  const hatchedAt = Date.now()
  saveGlobalConfig(current => ({
    ...current,
    companion: {
      ...soul,
      hatchedAt,
    },
  }))
  return {
    ...bones,
    ...soul,
    hatchedAt,
  }
}

function setReaction(
  setAppState: Parameters<LocalJSXCommandCall>[1]['setAppState'],
): (reaction: string) => void {
  return reaction =>
    setAppState(prev =>
      prev.companionReaction === reaction
        ? prev
        : {
            ...prev,
            companionReaction: reaction,
          },
    )
}

function StatRow({ color, name, value }: StatRowProps): React.ReactNode {
  return (
    <Box>
      <Text color={color}>{name}</Text>
      <Text>{' '}</Text>
      <Text dimColor>{String(value).padStart(3)}</Text>
    </Box>
  )
}

function CompanionCard({
  companion,
  lastReaction,
  onDone,
}: CompanionCardProps): React.ReactNode {
  const color = RARITY_COLORS[companion.rarity]
  const spriteLines = renderSprite(companion, 0)
  useInput(
    () => {
      onDone?.(undefined, { display: 'skip' })
    },
    { isActive: onDone !== undefined },
  )

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={color}
      paddingX={2}
      paddingY={1}
      width={40}
      flexShrink={0}
    >
      <Box justifyContent="space-between">
        <Text bold color={color}>
          {RARITY_STARS[companion.rarity]} {companion.rarity.toUpperCase()}
        </Text>
        <Text color={color}>{companion.species.toUpperCase()}</Text>
      </Box>
      {companion.shiny ? (
        <Text color="warning" bold>
          ✨ SHINY ✨
        </Text>
      ) : null}
      <Box flexDirection="column" marginY={1}>
        {spriteLines.map((line, index) => (
          <Text key={index} color={color}>
            {line}
          </Text>
        ))}
      </Box>
      <Text bold>{companion.name}</Text>
      <Box marginY={1}>
        <Text dimColor italic>
          "{companion.personality}"
        </Text>
      </Box>
      <Box flexDirection="column">
        {STAT_NAMES.map(name => (
          <StatRow
            key={name}
            color={companion.rarity}
            name={name}
            value={companion.stats[name]}
          />
        ))}
      </Box>
      {lastReaction ? (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>last said</Text>
          <Box borderStyle="round" borderColor="inactive" paddingX={1}>
            <Text dimColor italic>
              {lastReaction}
            </Text>
          </Box>
        </Box>
      ) : null}
    </Box>
  )
}

function Hatching({ hatching, onDone }: HatchingProps): React.ReactNode {
  const { columns } = useTerminalSize()
  const [tick, setTick] = useState(0)
  const [hatchedCompanion, setHatchedCompanion] = useState<Companion | null>(
    null,
  )
  const [revealStartTick, setRevealStartTick] = useState<number | null>(null)
  const [revealedCompanion, setRevealedCompanion] = useState<Companion | null>(
    null,
  )

  useEffect(() => {
    const interval = setInterval(() => {
      setTick(current => current + 1)
    }, HATCH_TICK_MS)
    hatching.then(setHatchedCompanion).catch(() => {})
    return () => clearInterval(interval)
  }, [hatching])

  if (revealStartTick === null && hatchedCompanion !== null && tick >= HATCH_MIN_WAIT_FRAMES) {
    setRevealStartTick(tick)
  }

  let frameIndex: number
  if (revealStartTick === null) {
    frameIndex = tick % HATCH_INTRO_FRAME_COUNT
  } else {
    const revealAge = tick - revealStartTick
    if (revealAge < HATCH_REVEAL_FRAME_COUNT) {
      frameIndex = HATCH_INTRO_FRAME_COUNT + revealAge
    } else {
      frameIndex = HATCH_FRAMES.length - 1
      if (!revealedCompanion && hatchedCompanion) {
        setRevealedCompanion(hatchedCompanion)
      }
    }
  }

  if (revealedCompanion) {
    return (
      <Box flexDirection="column">
        <CompanionCard companion={revealedCompanion} onDone={onDone} />
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>{revealedCompanion.name} is here · it'll chime in as you code</Text>
          <Text dimColor>your buddy won't count toward your usage</Text>
          <Text dimColor>say its name to get its take · /buddy pet · /buddy off</Text>
          <Box marginTop={1}>
            <Text dimColor>press any key</Text>
          </Box>
        </Box>
      </Box>
    )
  }

  const frame = HATCH_FRAMES[frameIndex]!
  const leftPad = ' '.repeat(1 + frame.offset)
  const rightPad = ' '.repeat(1 - frame.offset)
  const borderColor = getRainbowColor(tick)

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      width={columns}
      borderStyle="round"
      borderColor={borderColor}
      paddingY={1}
    >
      {frame.lines.map((line, index) => (
        <Text key={index}>
          {leftPad}
          {line}
          {rightPad}
        </Text>
      ))}
      <Box flexDirection="column" alignItems="center" marginTop={1}>
        <Text dimColor>hatching a coding buddy…</Text>
        <Text dimColor>it'll watch you work and occasionally have opinions</Text>
      </Box>
    </Box>
  )
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const config = getGlobalConfig()
  const trimmedArgs = args?.trim()

  if (trimmedArgs === 'pet') {
    const companion = getCompanion()
    if (!companion) {
      onDone('no companion yet · run /buddy first', { display: 'system' })
      return null
    }
    if (config.companionMuted === true) {
      saveGlobalConfig(current => ({
        ...current,
        companionMuted: false,
      }))
    }
    context.setAppState(current => ({
      ...current,
      companionPetAt: Date.now(),
    }))
    void firePetReaction(setReaction(context.setAppState))
    onDone(`petted ${companion.name}`, { display: 'system' })
    return null
  }

  if (trimmedArgs === 'off') {
    if (config.companionMuted !== true) {
      saveGlobalConfig(current => ({
        ...current,
        companionMuted: true,
      }))
    }
    onDone('companion muted', { display: 'system' })
    return null
  }

  if (trimmedArgs === 'on') {
    if (config.companionMuted === true) {
      saveGlobalConfig(current => ({
        ...current,
        companionMuted: false,
      }))
    }
    onDone('companion unmuted', { display: 'system' })
    return null
  }

  if (config.companionMuted === true) {
    saveGlobalConfig(current => ({
      ...current,
      companionMuted: false,
    }))
  }

  const existingCompanion = getCompanion()
  if (existingCompanion) {
    return (
      <CompanionCard
        companion={existingCompanion}
        lastReaction={getLastCompanionReaction()}
        onDone={onDone}
      />
    )
  }

  const { bones, inspirationSeed } = roll(companionUserId())
  const hatching = hatchCompanion(bones, inspirationSeed)
  hatching
    .then(companion => fireHatchReaction(companion, setReaction(context.setAppState)))
    .catch(() => {})

  return <Hatching hatching={hatching} onDone={onDone} />
}
