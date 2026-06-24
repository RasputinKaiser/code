import type { PermissionMode } from 'src/utils/permissions/PermissionMode.js'

export type StarshipStatusLineChunk = {
  text: string
  color?: string
  bold?: boolean
  dim?: boolean
}

export type StarshipStatusLineInput = {
  modelName: string
  effortLevel: string
  contextRemaining: number | null
  cwd: string | null
  activeLabel?: string
  worktreeName?: string
  worktreeBranch?: string
  isRemote?: boolean
  permissionMode: PermissionMode
}

const MODULE_GAP = '  '
const MODULE_SEP = ' · '
const MAIN_THREAD_LABEL = 'Main'

function getModeLabel(mode: PermissionMode): string | null {
  switch (mode) {
    case 'acceptEdits':
      return 'accept edits'
    case 'bypassPermissions':
      return 'bypass'
    case 'dontAsk':
      return "don't ask"
    case 'plan':
      return 'plan'
    case 'auto':
      return 'auto'
    case 'default':
    default:
      return null
  }
}

function getModeBadgeColor(mode: PermissionMode): string {
  switch (mode) {
    case 'acceptEdits':
      return 'autoAccept'
    case 'bypassPermissions':
    case 'dontAsk':
      return 'error'
    case 'plan':
      return 'planMode'
    case 'auto':
      return 'warning'
    case 'default':
    default:
      return 'subtle'
  }
}

function getContextColor(remaining: number): string {
  if (remaining <= 10) return 'error'
  if (remaining <= 25) return 'warning'
  return 'success'
}

function pushModule(
  chunks: StarshipStatusLineChunk[],
  moduleChunks: StarshipStatusLineChunk[],
): void {
  if (chunks.length > 0) {
    chunks.push({
      text: MODULE_GAP,
      color: 'subtle',
      dim: true,
    })
  }
  chunks.push(...moduleChunks)
}

export function buildStarshipStatusLineChunks(
  input: StarshipStatusLineInput,
): StarshipStatusLineChunk[] {
  const chunks: StarshipStatusLineChunk[] = []

  pushModule(chunks, [
    { text: '◉', color: 'suggestion', bold: true },
    { text: ' ' },
    {
      text: input.modelName,
      color: 'suggestion',
      bold: true,
    },
    { text: MODULE_SEP, color: 'subtle', dim: true },
    { text: input.effortLevel, color: 'suggestion', bold: true },
  ])

  if (input.contextRemaining !== null) {
    const contextColor = getContextColor(input.contextRemaining)
    pushModule(chunks, [
      { text: '◔', color: contextColor, bold: true },
      { text: ' ' },
      {
        text: `${input.contextRemaining}% left`,
        color: contextColor,
      },
    ])
  }

  if (input.cwd) {
    pushModule(chunks, [
      { text: '⌂', color: 'professionalBlue', bold: true },
      { text: ' ' },
      { text: input.cwd, color: 'professionalBlue' },
    ])
  }

  if (input.worktreeName) {
    const worktreeChunks: StarshipStatusLineChunk[] = [
      { text: input.worktreeName, bold: true },
    ]
    if (input.worktreeBranch) {
      worktreeChunks.push(
        { text: MODULE_SEP, color: 'subtle', dim: true },
        { text: input.worktreeBranch },
      )
    }
    pushModule(chunks, worktreeChunks)
  }

  if (input.isRemote) {
    pushModule(chunks, [{ text: 'remote', color: 'warning' }])
  }

  const modeLabel = getModeLabel(input.permissionMode)
  if (modeLabel) {
    pushModule(chunks, [
      {
        text: modeLabel,
        color: getModeBadgeColor(input.permissionMode),
      },
    ])
  }

  if (input.activeLabel && input.activeLabel !== MAIN_THREAD_LABEL) {
    pushModule(chunks, [{ text: input.activeLabel, bold: true }])
  }

  return chunks
}

export function renderStarshipStatusLineText(
  input: StarshipStatusLineInput,
): string {
  return buildStarshipStatusLineChunks(input)
    .map(chunk => chunk.text)
    .join('')
}
