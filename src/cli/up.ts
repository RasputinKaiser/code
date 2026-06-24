import { spawn } from 'child_process'
import { access, readFile } from 'fs/promises'
import { dirname, parse } from 'path'
import { getCwd } from '../utils/cwd.js'
import { logForDebugging } from '../utils/debug.js'
import { isENOENT } from '../utils/errors.js'
import { gracefulShutdown } from '../utils/gracefulShutdown.js'
import { writeToStderr, writeToStdout } from '../utils/process.js'
import { whichSync } from '../utils/which.js'

type Section = {
  content: string
  startLine: number
}

type ScriptBlock = {
  code: string
  language: string
  startLine: number
}

function normalizeHeading(text: string): string {
  return text
    .replace(/[`*_~]/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (error) {
    if (isENOENT(error)) {
      return false
    }
    throw error
  }
}

async function findNearestInstructionFile(startDir: string): Promise<string | null> {
  let currentDir = startDir

  while (true) {
    const candidates = [
      `${currentDir}/AGENTS.md`,
      `${currentDir}/NCODE.md`,
      `${currentDir}/CLAUDE.md`,
      `${currentDir}/.ncode/NCODE.md`,
      `${currentDir}/.claude/CLAUDE.md`,
    ]

    for (const candidate of candidates) {
      if (await fileExists(candidate)) {
        return candidate
      }
    }

    const parentDir = dirname(currentDir)
    if (parentDir === currentDir) {
      return null
    }
    currentDir = parentDir
  }
}

function extractUpSection(markdown: string): Section | null {
  const lines = markdown.split(/\r?\n/)
  let sectionStart = -1
  let sectionLevel = 0

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const match = line.match(/^(#{1,6})\s+(.*)$/)
    if (!match) {
      continue
    }

    const level = match[1]?.length ?? 0
    const title = normalizeHeading(match[2] ?? '')
    if (
      title === 'code up' ||
      title === 'ncode up'
    ) {
      sectionStart = index + 1
      sectionLevel = level
      break
    }
  }

  if (sectionStart === -1) {
    return null
  }

  let sectionEnd = lines.length
  for (let index = sectionStart; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const match = line.match(/^(#{1,6})\s+(.*)$/)
    if (!match) {
      continue
    }

    const level = match[1]?.length ?? 0
    if (level <= sectionLevel) {
      sectionEnd = index
      break
    }
  }

  return {
    content: lines.slice(sectionStart, sectionEnd).join('\n'),
    startLine: sectionStart + 1,
  }
}

function isExecutableBlockLanguage(language: string): boolean {
  const normalized = language.trim().toLowerCase()
  return (
    normalized === '' ||
    normalized === 'bash' ||
    normalized === 'sh' ||
    normalized === 'shell' ||
    normalized === 'zsh' ||
    normalized === 'fish'
  )
}

function extractExecutableBlocks(section: Section): ScriptBlock[] {
  const lines = section.content.split(/\r?\n/)
  const blocks: ScriptBlock[] = []
  let activeFence: string | null = null
  let activeLanguage = ''
  let activeStartLine = 0
  let buffer: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const fenceMatch = line.match(/^(```|~~~)\s*([^\s`]*)?.*$/)

    if (!activeFence) {
      if (!fenceMatch) {
        continue
      }
      activeFence = fenceMatch[1] ?? '```'
      activeLanguage = (fenceMatch[2] ?? '').trim()
      activeStartLine = section.startLine + index + 1
      buffer = []
      continue
    }

    if (line.trim() === activeFence) {
      const code = buffer.join('\n').trim()
      if (code && isExecutableBlockLanguage(activeLanguage)) {
        blocks.push({
          code,
          language: activeLanguage,
          startLine: activeStartLine,
        })
      }
      activeFence = null
      activeLanguage = ''
      buffer = []
      continue
    }

    buffer.push(line)
  }

  return blocks
}

function resolveShellForLanguage(language: string): string {
  const normalized = language.trim().toLowerCase()

  if (normalized === 'fish') {
    const fish = whichSync('fish')
    if (!fish) {
      throw new Error('Found a fish code block, but fish is not installed.')
    }
    return fish
  }

  if (normalized === 'zsh') {
    const zsh = whichSync('zsh')
    if (!zsh) {
      throw new Error('Found a zsh code block, but zsh is not installed.')
    }
    return zsh
  }

  return whichSync('bash') ?? whichSync('sh') ?? process.env.SHELL ?? '/bin/sh'
}

function getShellArgs(shellPath: string, script: string): string[] {
  const shellName = parse(shellPath).name.toLowerCase()
  if (shellName === 'fish') {
    return ['-c', script]
  }
  return ['-lc', script]
}

async function runBlock(block: ScriptBlock, cwd: string): Promise<number> {
  const shellPath = resolveShellForLanguage(block.language)
  const args = getShellArgs(shellPath, block.code)

  logForDebugging(
    `[code up] Running ${block.language || 'shell'} block from line ${block.startLine} with ${shellPath} in ${cwd}`,
  )

  return new Promise<number>(resolve => {
    const child = spawn(shellPath, args, {
      cwd,
      env: process.env,
      stdio: 'inherit',
    })

    child.once('error', error => {
      writeToStderr(`code up failed to start ${shellPath}: ${error.message}\n`)
      resolve(1)
    })

    child.once('close', code => {
      resolve(code ?? 1)
    })
  })
}

export async function up(): Promise<void> {
  try {
    const instructionFilePath = await findNearestInstructionFile(getCwd())
    if (!instructionFilePath) {
      writeToStderr(
        'No AGENTS.md or NCODE.md instruction file was found in this directory or any parent directory.\n',
      )
      await gracefulShutdown(1)
      return
    }

    const markdown = await readFile(instructionFilePath, 'utf8')
    const section = extractUpSection(markdown)
    if (!section) {
      writeToStderr(
        `No "# code up" or "# ncode up" section was found in ${instructionFilePath}.\n`,
      )
      await gracefulShutdown(1)
      return
    }

    const blocks = extractExecutableBlocks(section)
    if (blocks.length === 0) {
      writeToStderr(
        `The setup section in ${instructionFilePath} does not contain any executable shell code blocks.\n`,
      )
      await gracefulShutdown(1)
      return
    }

    writeToStdout(`Using ${instructionFilePath}\n`)
    for (const [index, block] of blocks.entries()) {
      writeToStdout(
        `\n[code up] Running block ${index + 1}/${blocks.length} (line ${block.startLine})\n`,
      )
      const exitCode = await runBlock(block, dirname(instructionFilePath))
      if (exitCode !== 0) {
        writeToStderr(
          `[code up] Block ${index + 1} failed with exit code ${exitCode}.\n`,
        )
        await gracefulShutdown(exitCode)
        return
      }
    }

    writeToStdout(`\n[code up] Completed ${blocks.length} setup block(s).\n`)
    await gracefulShutdown(0)
  } catch (error) {
    writeToStderr(`code up failed: ${error instanceof Error ? error.message : String(error)}\n`)
    await gracefulShutdown(1)
  }
}
