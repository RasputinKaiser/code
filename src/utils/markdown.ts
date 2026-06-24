import chalk from 'chalk'
import { marked, type Token, type Tokens } from 'marked'
import stripAnsi from 'strip-ansi'
import { color } from '../components/design-system/color.js'
import { BLOCKQUOTE_BAR } from '../constants/figures.js'
import { stringWidth } from '../ink/stringWidth.js'
import { supportsHyperlinks } from '../ink/supports-hyperlinks.js'
import type { CliHighlight } from './cliHighlight.js'
import { logForDebugging } from './debug.js'
import { hashContent } from './hash.js'
import { createHyperlink } from './hyperlink.js'
import { stripPromptXMLTags } from './messages.js'
import type { ThemeName } from './theme.js'

// Use \n unconditionally — os.EOL is \r\n on Windows, and the extra \r
// breaks the character-to-segment mapping in applyStylesToWrappedText,
// causing styled text to shift right.
const EOL = '\n'

let markedConfigured = false

const APPLY_MARKDOWN_CACHE_MAX = 64
const APPLY_MARKDOWN_CACHE_MIN_CONTENT_LENGTH = 512
const applyMarkdownCache = new Map<string, string>()
const STRUCTURED_DIAGRAM_CHAR_RE =
  /[┌┐└┘├┤┬┴┼│─╭╮╰╯═║╔╗╚╝╠╣╦╩╬►◄▲▼→←↑↓]/
const STRUCTURED_DIAGRAM_BAR_RE = /^\s*[─═]{6,}\s*$/

export type MarkdownSegment =
  | {
      type: 'markdown'
      content: string
    }
  | {
      type: 'preformatted_diagram'
      content: string
    }

export function clearApplyMarkdownCache(): void {
  applyMarkdownCache.clear()
}

export function looksLikePreformattedDiagram(content: string): boolean {
  const lines = content.split('\n').filter(line => line.trim().length > 0)
  if (lines.length < 3) {
    return false
  }

  let diagramLineCount = 0
  let indentedLineCount = 0
  for (const line of lines) {
    if (STRUCTURED_DIAGRAM_CHAR_RE.test(line)) {
      diagramLineCount += 1
    }
    if (/^\s{4,}\S/.test(line)) {
      indentedLineCount += 1
    }
  }

  if (diagramLineCount < 2) {
    return false
  }

  return diagramLineCount + indentedLineCount >= Math.ceil(lines.length / 2)
}

function classifyPotentialDiagramLine(
  line: string,
): 'signal' | 'support' | 'other' {
  if (line.trim().length === 0) {
    return 'support'
  }
  if (
    STRUCTURED_DIAGRAM_CHAR_RE.test(line) ||
    STRUCTURED_DIAGRAM_BAR_RE.test(line)
  ) {
    return 'signal'
  }
  if (/^\s{4,}\S/.test(line)) {
    return 'support'
  }
  return 'other'
}

function detectFenceDelimiter(
  line: string,
): { marker: '`' | '~'; size: number } | null {
  const match = line.match(/^[ ]{0,3}(`{3,}|~{3,})/)
  if (!match) return null
  const raw = match[1]
  if (!raw) return null
  const marker = raw[0] as '`' | '~'
  return { marker, size: raw.length }
}

function isFenceClose(
  line: string,
  fence: { marker: '`' | '~'; size: number } | null,
): boolean {
  if (!fence) return false
  const match = line.match(/^[ ]{0,3}(`{3,}|~{3,})[ \t]*$/)
  if (!match) return false
  const raw = match[1]
  if (!raw) return false
  return raw[0] === fence.marker && raw.length >= fence.size
}

function getLineStartOffsets(lines: string[]): number[] {
  const offsets: number[] = []
  let offset = 0
  for (const line of lines) {
    offsets.push(offset)
    offset += line.length + 1
  }
  return offsets
}

function sliceContentByLines(
  content: string,
  lineOffsets: number[],
  start: number,
  end: number,
): string {
  if (start >= end) {
    return ''
  }

  const startOffset = lineOffsets[start] ?? content.length
  const endOffset = end < lineOffsets.length ? lineOffsets[end] ?? content.length : content.length
  return content.slice(startOffset, endOffset)
}

function pushMarkdownSegment(
  segments: MarkdownSegment[],
  content: string,
): void {
  if (content.length === 0) {
    return
  }

  const last = segments.at(-1)
  if (last?.type === 'markdown') {
    last.content += content
    return
  }

  segments.push({
    type: 'markdown',
    content,
  })
}

function splitPipeCells(line: string): string[] {
  let trimmed = line.trim()
  if (!trimmed.includes('|')) {
    return []
  }
  if (trimmed.startsWith('|')) {
    trimmed = trimmed.slice(1)
  }
  if (trimmed.endsWith('|')) {
    trimmed = trimmed.slice(0, -1)
  }
  return trimmed.split('|').map(cell => cell.trim())
}

function isPipeTableCandidate(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('|') && splitPipeCells(trimmed).length >= 2
}

function isRepairedPipeTableRowStart(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('|') && splitPipeCells(trimmed).length >= 1
}

function isPipeTableDelimiter(line: string): boolean {
  const cells = splitPipeCells(line)
  if (cells.length === 0) {
    return false
  }
  return cells.every(cell => /^:?-{3,}:?$/.test(cell))
}

function makePipeTableDelimiter(columnCount: number): string {
  return `|${Array.from({ length: columnCount }, () => '---').join('|')}|`
}

function shouldContinueRepairedTableRow(
  row: string,
  columnCount: number,
): boolean {
  return splitPipeCells(row).length < columnCount || !row.trimEnd().endsWith('|')
}

function appendTableContinuation(row: string, continuation: string): string {
  const trimmedRow = row.trimEnd()
  const trimmedContinuation = continuation.trim()
  const rowCells = splitPipeCells(trimmedRow)
  const continuationCells = splitPipeCells(trimmedContinuation)
  const needsMissingSeparator =
    !trimmedRow.endsWith('|') &&
    rowCells.length > 0 &&
    continuationCells.length > 1

  return needsMissingSeparator
    ? `${trimmedRow} | ${trimmedContinuation}`
    : `${trimmedRow} ${trimmedContinuation}`
}

function closeRepairedTableRow(row: string): string {
  return row.trimEnd().endsWith('|') ? row.trimEnd() : `${row.trimEnd()} |`
}

export function repairMalformedPipeTables(content: string): string {
  if (!content.includes('|')) {
    return content
  }

  const lines = content.split('\n')
  const repaired: string[] = []
  let i = 0
  let activeFence: { marker: '`' | '~'; size: number } | null = null

  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (activeFence) {
      repaired.push(line)
      if (isFenceClose(line, activeFence)) {
        activeFence = null
      }
      i += 1
      continue
    }

    const openingFence = detectFenceDelimiter(line)
    if (openingFence) {
      activeFence = openingFence
      repaired.push(line)
      i += 1
      continue
    }

    const nextLine = lines[i + 1] ?? ''
    if (
      !isPipeTableCandidate(line) ||
      !isPipeTableDelimiter(nextLine) ||
      splitPipeCells(nextLine).length >= splitPipeCells(line).length
    ) {
      repaired.push(line)
      i += 1
      continue
    }

    const columnCount = splitPipeCells(line).length
    repaired.push(line.trimEnd())
    repaired.push(makePipeTableDelimiter(columnCount))
    i += 2

    while (i < lines.length) {
      const rowStart = lines[i] ?? ''
      if (
        rowStart.trim().length === 0 ||
        !isRepairedPipeTableRowStart(rowStart)
      ) {
        break
      }

      let row = rowStart.trimEnd()
      i += 1
      while (
        shouldContinueRepairedTableRow(row, columnCount) &&
        i < lines.length
      ) {
        const continuation = lines[i] ?? ''
        if (continuation.trim().length === 0) {
          break
        }
        row = appendTableContinuation(row, continuation)
        i += 1
      }
      repaired.push(closeRepairedTableRow(row))
    }
  }

  return repaired.join('\n')
}

export function detectPreformattedMarkdownSegments(
  content: string,
): MarkdownSegment[] {
  if (content.length === 0) {
    return []
  }

  const lines = content.split('\n')
  const lineOffsets = getLineStartOffsets(lines)
  const segments: MarkdownSegment[] = []
  let markdownCursor = 0
  let lineIndex = 0
  let activeFence: { marker: '`' | '~'; size: number } | null = null

  while (lineIndex < lines.length) {
    const line = lines[lineIndex] ?? ''
    if (activeFence) {
      if (isFenceClose(line, activeFence)) {
        activeFence = null
      }
      lineIndex += 1
      continue
    }

    const openingFence = detectFenceDelimiter(line)
    if (openingFence) {
      activeFence = openingFence
      lineIndex += 1
      continue
    }

    if (classifyPotentialDiagramLine(line) === 'other') {
      lineIndex += 1
      continue
    }

    const runStart = lineIndex
    while (
      lineIndex < lines.length &&
      !detectFenceDelimiter(lines[lineIndex] ?? '') &&
      classifyPotentialDiagramLine(lines[lineIndex] ?? '') !== 'other'
    ) {
      lineIndex += 1
    }
    const runEnd = lineIndex

    let candidateStart = runStart
    while (
      candidateStart < runEnd &&
      (lines[candidateStart] ?? '').trim().length === 0
    ) {
      candidateStart += 1
    }

    let candidateEnd = runEnd
    while (
      candidateEnd > candidateStart &&
      (lines[candidateEnd - 1] ?? '').trim().length === 0
    ) {
      candidateEnd -= 1
    }

    if (candidateStart >= candidateEnd) {
      continue
    }

    const candidate = sliceContentByLines(
      content,
      lineOffsets,
      candidateStart,
      candidateEnd,
    )
    if (!looksLikePreformattedDiagram(candidate)) {
      continue
    }

    pushMarkdownSegment(
      segments,
      sliceContentByLines(content, lineOffsets, markdownCursor, candidateStart),
    )
    segments.push({
      type: 'preformatted_diagram',
      content: candidate,
    })
    markdownCursor = candidateEnd
  }

  pushMarkdownSegment(
    segments,
    sliceContentByLines(content, lineOffsets, markdownCursor, lines.length),
  )

  return segments
}

export function lexMarkdownPreservingPreformattedDiagrams(
  content: string,
): Token[] {
  configureMarked()
  const segments = detectPreformattedMarkdownSegments(content)
  if (segments.length === 0) {
    return marked.lexer(repairMalformedPipeTables(content))
  }

  const tokens: Token[] = []
  for (const segment of segments) {
    if (segment.type === 'preformatted_diagram') {
      tokens.push({
        type: 'code',
        raw: segment.content,
        text: segment.content,
        lang: '',
      } as Token)
      continue
    }
    tokens.push(...marked.lexer(repairMalformedPipeTables(segment.content)))
  }
  return tokens
}

export function configureMarked(): void {
  if (markedConfigured) return
  markedConfigured = true

  // Disable strikethrough parsing - the model often uses ~ for "approximate"
  // (e.g., ~100) and rarely intends actual strikethrough formatting
  marked.use({
    tokenizer: {
      del() {
        return undefined
      },
    },
  })
}

export function applyMarkdown(
  content: string,
  theme: ThemeName,
  highlight: CliHighlight | null = null,
): string {
  const stripped = stripPromptXMLTags(content)
  const shouldCache = stripped.length >= APPLY_MARKDOWN_CACHE_MIN_CONTENT_LENGTH
  const cacheKey = shouldCache
    ? `${hashContent(stripped)}|${theme}|${highlight ? 1 : 0}`
    : undefined

  if (cacheKey) {
    const hit = applyMarkdownCache.get(cacheKey)
    if (hit !== undefined) {
      applyMarkdownCache.delete(cacheKey)
      applyMarkdownCache.set(cacheKey, hit)
      return hit
    }
  }

  // String-only markdown preview paths (notably AskUserQuestion previews) do
  // not go through Markdown.tsx, so they bypass the block/token caches above.
  // Keep a tiny LRU here for large preview bodies to avoid repeatedly lexing
  // and re-highlighting the same rendered file/markdown payload on rerender.
  const rendered = lexMarkdownPreservingPreformattedDiagrams(stripped)
    .map(_ => formatToken(_, theme, 0, null, null, highlight))
    .join('')
    .trim()

  if (cacheKey) {
    if (applyMarkdownCache.size >= APPLY_MARKDOWN_CACHE_MAX) {
      const oldest = applyMarkdownCache.keys().next().value
      if (oldest !== undefined) applyMarkdownCache.delete(oldest)
    }
    applyMarkdownCache.set(cacheKey, rendered)
  }

  return rendered
}

export function formatToken(
  token: Token,
  theme: ThemeName,
  listDepth = 0,
  orderedListNumber: number | null = null,
  parent: Token | null = null,
  highlight: CliHighlight | null = null,
): string {
  switch (token.type) {
    case 'blockquote': {
      const inner = (token.tokens ?? [])
        .map(_ => formatToken(_, theme, 0, null, null, highlight))
        .join('')
      // Prefix each line with a dim vertical bar. Keep text italic but at
      // normal brightness — chalk.dim is nearly invisible on dark themes.
      const bar = chalk.dim(BLOCKQUOTE_BAR)
      return inner
        .split(EOL)
        .map(line =>
          stripAnsi(line).trim() ? `${bar} ${chalk.italic(line)}` : line,
        )
        .join(EOL)
    }
    case 'code': {
      if (!highlight) {
        return token.text + EOL
      }
      let language = 'plaintext'
      if (token.lang) {
        if (highlight.supportsLanguage(token.lang)) {
          language = token.lang
        } else {
          logForDebugging(
            `Language not supported while highlighting code, falling back to plaintext: ${token.lang}`,
          )
        }
      }
      return highlight.highlight(token.text, { language }) + EOL
    }
    case 'codespan': {
      // inline code
      return color('permission', theme)(token.text)
    }
    case 'em':
      return chalk.italic(
        (token.tokens ?? [])
          .map(_ => formatToken(_, theme, 0, null, parent, highlight))
          .join(''),
      )
    case 'strong':
      return chalk.bold(
        (token.tokens ?? [])
          .map(_ => formatToken(_, theme, 0, null, parent, highlight))
          .join(''),
      )
    case 'heading':
      switch (token.depth) {
        case 1: // h1
          return (
            chalk.bold.italic.underline(
              (token.tokens ?? [])
                .map(_ => formatToken(_, theme, 0, null, null, highlight))
                .join(''),
            ) +
            EOL +
            EOL
          )
        case 2: // h2
          return (
            chalk.bold(
              (token.tokens ?? [])
                .map(_ => formatToken(_, theme, 0, null, null, highlight))
                .join(''),
            ) +
            EOL +
            EOL
          )
        default: // h3+
          return (
            chalk.bold(
              (token.tokens ?? [])
                .map(_ => formatToken(_, theme, 0, null, null, highlight))
                .join(''),
            ) +
            EOL +
            EOL
          )
      }
    case 'hr':
      return '---'
    case 'image':
      return token.href
    case 'link': {
      // Prevent mailto links from being displayed as clickable links
      if (token.href.startsWith('mailto:')) {
        // Extract email from mailto: link and display as plain text
        const email = token.href.replace(/^mailto:/, '')
        return email
      }
      // Extract display text from the link's child tokens
      const linkText = (token.tokens ?? [])
        .map(_ => formatToken(_, theme, 0, null, token, highlight))
        .join('')
      const plainLinkText = stripAnsi(linkText)
      // If the link has meaningful display text (different from the URL),
      // show it as a clickable hyperlink. In terminals that support OSC 8,
      // users see the text and can hover/click to see the URL.
      if (plainLinkText && plainLinkText !== token.href) {
        return createHyperlink(token.href, linkText)
      }
      // When the display text matches the URL (or is empty), just show the URL
      return createHyperlink(token.href)
    }
    case 'list': {
      return token.items
        .map((_: Token, index: number) =>
          formatToken(
            _,
            theme,
            listDepth,
            token.ordered ? token.start + index : null,
            token,
            highlight,
          ),
        )
        .join('')
    }
    case 'list_item':
      return (token.tokens ?? [])
        .map(
          _ =>
            `${'  '.repeat(listDepth)}${formatToken(_, theme, listDepth + 1, orderedListNumber, token, highlight)}`,
        )
        .join('')
    case 'paragraph':
      return (
        (token.tokens ?? [])
          .map(_ => formatToken(_, theme, 0, null, null, highlight))
          .join('') + EOL
      )
    case 'space':
      return EOL
    case 'br':
      return EOL
    case 'text':
      if (parent?.type === 'link') {
        // Already inside a markdown link — the link handler will wrap this
        // in an OSC 8 hyperlink. Linkifying here would nest a second OSC 8
        // sequence, and terminals honor the innermost one, overriding the
        // link's actual href.
        return token.text
      }
      if (parent?.type === 'list_item') {
        return `${orderedListNumber === null ? '-' : getListNumber(listDepth, orderedListNumber) + '.'} ${token.tokens ? token.tokens.map(_ => formatToken(_, theme, listDepth, orderedListNumber, token, highlight)).join('') : linkifyIssueReferences(token.text)}${EOL}`
      }
      return linkifyIssueReferences(token.text)
    case 'table': {
      const tableToken = token as Tokens.Table

      // Helper function to get the text content that will be displayed (after stripAnsi)
      function getDisplayText(tokens: Token[] | undefined): string {
        return stripAnsi(
          tokens
            ?.map(_ => formatToken(_, theme, 0, null, null, highlight))
            .join('') ?? '',
        )
      }

      // Determine column widths based on displayed content (without formatting)
      const columnWidths = tableToken.header.map((header, index) => {
        let maxWidth = stringWidth(getDisplayText(header.tokens))
        for (const row of tableToken.rows) {
          const cellLength = stringWidth(getDisplayText(row[index]?.tokens))
          maxWidth = Math.max(maxWidth, cellLength)
        }
        return Math.max(maxWidth, 3) // Minimum width of 3
      })

      // Format header row
      let tableOutput = '| '
      tableToken.header.forEach((header, index) => {
        const content =
          header.tokens
            ?.map(_ => formatToken(_, theme, 0, null, null, highlight))
            .join('') ?? ''
        const displayText = getDisplayText(header.tokens)
        const width = columnWidths[index]!
        const align = tableToken.align?.[index]
        tableOutput +=
          padAligned(content, stringWidth(displayText), width, align) + ' | '
      })
      tableOutput = tableOutput.trimEnd() + EOL

      // Add separator row
      tableOutput += '|'
      columnWidths.forEach(width => {
        // Always use dashes, don't show alignment colons in the output
        const separator = '-'.repeat(width + 2) // +2 for spaces on each side
        tableOutput += separator + '|'
      })
      tableOutput += EOL

      // Format data rows
      tableToken.rows.forEach(row => {
        tableOutput += '| '
        row.forEach((cell, index) => {
          const content =
            cell.tokens
              ?.map(_ => formatToken(_, theme, 0, null, null, highlight))
              .join('') ?? ''
          const displayText = getDisplayText(cell.tokens)
          const width = columnWidths[index]!
          const align = tableToken.align?.[index]
          tableOutput +=
            padAligned(content, stringWidth(displayText), width, align) + ' | '
        })
        tableOutput = tableOutput.trimEnd() + EOL
      })

      return tableOutput + EOL
    }
    case 'escape':
      // Markdown escape: \) → ), \\ → \, etc.
      return token.text
    case 'def':
    case 'del':
    case 'html':
      // These token types are not rendered
      return ''
  }
  return ''
}

// Matches owner/repo#NNN style GitHub issue/PR references. The qualified form
// is unambiguous — bare #NNN was removed because it guessed the current repo
// and was wrong whenever the assistant discussed a different one.
// Owner segment disallows dots (GitHub usernames are alphanumerics + hyphens
// only) so hostnames like docs.github.io/guide#42 don't false-positive. Repo
// segment allows dots (e.g. cc.kurs.web). Lookbehind is avoided — it defeats
// YARR JIT in JSC.
const ISSUE_REF_PATTERN =
  /(^|[^\w./-])([A-Za-z0-9][\w-]*\/[A-Za-z0-9][\w.-]*)#(\d+)\b/g

/**
 * Replaces owner/repo#123 references with clickable hyperlinks to GitHub.
 */
function linkifyIssueReferences(text: string): string {
  if (!supportsHyperlinks()) {
    return text
  }
  return text.replace(
    ISSUE_REF_PATTERN,
    (_match, prefix, repo, num) =>
      prefix +
      createHyperlink(
        `https://github.com/${repo}/issues/${num}`,
        `${repo}#${num}`,
      ),
  )
}

function numberToLetter(n: number): string {
  let result = ''
  while (n > 0) {
    n--
    result = String.fromCharCode(97 + (n % 26)) + result
    n = Math.floor(n / 26)
  }
  return result
}

const ROMAN_VALUES: ReadonlyArray<[number, string]> = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
]

function numberToRoman(n: number): string {
  let result = ''
  for (const [value, numeral] of ROMAN_VALUES) {
    while (n >= value) {
      result += numeral
      n -= value
    }
  }
  return result
}

function getListNumber(listDepth: number, orderedListNumber: number): string {
  switch (listDepth) {
    case 0:
    case 1:
      return orderedListNumber.toString()
    case 2:
      return numberToLetter(orderedListNumber)
    case 3:
      return numberToRoman(orderedListNumber)
    default:
      return orderedListNumber.toString()
  }
}

/**
 * Pad `content` to `targetWidth` according to alignment. `displayWidth` is the
 * visible width of `content` (caller computes this, e.g. via stringWidth on
 * stripAnsi'd text, so ANSI codes in `content` don't affect padding).
 */
export function padAligned(
  content: string,
  displayWidth: number,
  targetWidth: number,
  align: 'left' | 'center' | 'right' | null | undefined,
): string {
  const padding = Math.max(0, targetWidth - displayWidth)
  if (align === 'center') {
    const leftPad = Math.floor(padding / 2)
    return ' '.repeat(leftPad) + content + ' '.repeat(padding - leftPad)
  }
  if (align === 'right') {
    return ' '.repeat(padding) + content
  }
  return content + ' '.repeat(padding)
}
