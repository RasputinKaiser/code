import fs from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const commandsTsPath = path.join(rootDir, 'src', 'commands.ts')
const bundledSkillsIndexPath = path.join(rootDir, 'src', 'skills', 'bundled', 'index.ts')
const builtinPluginsInitPath = path.join(rootDir, 'src', 'plugins', 'bundled', 'index.ts')
const buildScriptPath = path.join(rootDir, 'build', 'build.mjs')
const runtimeProbePath = path.join(rootDir, 'scripts', 'probe_runtime_dynamic_surface.ts')
const runtimeProbeRunnerPath = path.join(rootDir, 'scripts', 'run_runtime_dynamic_probe.mjs')
const matrixPath = path.join(rootDir, 'SLASH_COMMAND_PARITY_MATRIX.md')

const commandsSource = await fs.readFile(commandsTsPath, 'utf8')
const buildSource = await fs.readFile(buildScriptPath, 'utf8')

function findMatchingDelimiter(source, startIndex, openChar, closeChar) {
  let depth = 0
  let quote = null
  let inLineComment = false
  let inBlockComment = false
  const templateResumeDepths = []

  for (let i = startIndex; i < source.length; i += 1) {
    const char = source[i]
    const next = source[i + 1]

    if (inLineComment) {
      if (char === '\n') inLineComment = false
      continue
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false
        i += 1
      }
      continue
    }

    if (quote) {
      if (quote === '`' && char === '$' && next === '{') {
        if (openChar === '{') depth += 1
        templateResumeDepths.push(depth)
        quote = null
        i += 1
        continue
      }
      if (char === '\\') {
        i += 1
        continue
      }
      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '/' && next === '/') {
      inLineComment = true
      i += 1
      continue
    }

    if (char === '/' && next === '*') {
      inBlockComment = true
      i += 1
      continue
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }

    if (char === openChar) {
      depth += 1
      continue
    }

    if (char === closeChar) {
      depth -= 1
      if (templateResumeDepths.at(-1) === depth + 1) {
        templateResumeDepths.pop()
        quote = '`'
        continue
      }
      if (depth === 0) return i
    }
  }

  throw new Error(`Unable to find matching ${closeChar} for ${openChar} at ${startIndex}`)
}

function extractBalancedSegment(source, startIndex, openChar, closeChar) {
  const endIndex = findMatchingDelimiter(source, startIndex, openChar, closeChar)
  return source.slice(startIndex, endIndex + 1)
}

function extractArrayBodyFromAnchor(source, anchor) {
  const anchorIndex = source.indexOf(anchor)
  if (anchorIndex === -1) throw new Error(`Unable to find anchor: ${anchor}`)
  const bracketStart = source.indexOf('[', anchorIndex + anchor.length)
  if (bracketStart === -1) throw new Error(`Unable to find array start for anchor: ${anchor}`)
  const fullArray = extractBalancedSegment(source, bracketStart, '[', ']')
  return fullArray.slice(1, -1)
}

function splitTopLevelCommaList(source) {
  const items = []
  let quote = null
  let inLineComment = false
  let inBlockComment = false
  let parenDepth = 0
  let bracketDepth = 0
  let braceDepth = 0
  let start = 0

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    const next = source[i + 1]

    if (inLineComment) {
      if (char === '\n') inLineComment = false
      continue
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false
        i += 1
      }
      continue
    }

    if (quote) {
      if (char === '\\') {
        i += 1
        continue
      }
      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '/' && next === '/') {
      inLineComment = true
      i += 1
      continue
    }

    if (char === '/' && next === '*') {
      inBlockComment = true
      i += 1
      continue
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }

    if (char === '(') {
      parenDepth += 1
      continue
    }
    if (char === ')') {
      parenDepth -= 1
      continue
    }
    if (char === '[') {
      bracketDepth += 1
      continue
    }
    if (char === ']') {
      bracketDepth -= 1
      continue
    }
    if (char === '{') {
      braceDepth += 1
      continue
    }
    if (char === '}') {
      braceDepth -= 1
      continue
    }

    if (
      char === ',' &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0
    ) {
      const item = source.slice(start, i).trim()
      if (item) items.push(item)
      start = i + 1
    }
  }

  const tail = source.slice(start).trim()
  if (tail) items.push(tail)
  return items
}

function resolveModuleCandidatesFromAbsolute(absolutePath) {
  const parsed = path.parse(absolutePath)
  const candidates = []

  if (parsed.ext === '.js') {
    candidates.push(
      path.join(parsed.dir, `${parsed.name}.ts`),
      path.join(parsed.dir, `${parsed.name}.tsx`),
      absolutePath,
      path.join(parsed.dir, `${parsed.name}.jsx`),
    )
  } else if (parsed.ext.length > 0) {
    candidates.push(absolutePath)
  } else {
    candidates.push(
      `${absolutePath}.ts`,
      `${absolutePath}.tsx`,
      `${absolutePath}.js`,
      `${absolutePath}.jsx`,
      path.join(absolutePath, 'index.ts'),
      path.join(absolutePath, 'index.tsx'),
      path.join(absolutePath, 'index.js'),
      path.join(absolutePath, 'index.jsx'),
    )
  }

  return candidates
}

function resolveCommandModule(specifier) {
  const relative = specifier.replace(/^\.\//, '')
  const absolutePath = path.join(rootDir, 'src', relative)
  return resolveModuleCandidatesFromAbsolute(absolutePath)
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function resolveExistingCommandModule(specifier) {
  for (const candidate of resolveCommandModule(specifier)) {
    if (await fileExists(candidate)) return candidate
  }
  return null
}

async function resolveExistingModuleFrom(baseFilePath, specifier) {
  const absolutePath = path.resolve(path.dirname(baseFilePath), specifier)
  for (const candidate of resolveModuleCandidatesFromAbsolute(absolutePath)) {
    if (await fileExists(candidate)) return candidate
  }
  return null
}

function cleanPath(p) {
  return path.relative(rootDir, p).replaceAll(path.sep, '/')
}

function parseSimpleStringArray(source, fieldName) {
  const match = source.match(new RegExp(`${fieldName}:\\s*\\[([^\\]]*)\\]`, 'm'))
  if (!match) return []
  return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1])
}

function parseMetadata(source) {
  const firstMatch = pattern => source.match(pattern)?.[1] ?? ''
  const name = firstMatch(/name:\s*'([^']+)'/)
  const type = firstMatch(/type:\s*'([^']+)'/)
  const description = firstMatch(/description:\s*`([^`]+)`/) || firstMatch(/description:\s*'([^']+)'/)
  const argumentHint = firstMatch(/argumentHint:\s*'([^']+)'/)
  const aliases = parseSimpleStringArray(source, 'aliases')
  const availability = parseSimpleStringArray(source, 'availability')
  const immediate = source.match(/immediate:\s*(true|false)/)?.[1] ?? ''
  const hiddenKind =
    source.match(/isHidden:\s*(true|false)/)?.[1] ??
    (source.includes('get isHidden()') ? 'getter' : '')
  const hasIsEnabled = source.includes('isEnabled:')
  return {
    name,
    type,
    description,
    argumentHint,
    aliases,
    availability,
    immediate,
    hiddenKind,
    hasIsEnabled,
  }
}

function parseBooleanField(source, fieldName) {
  return source.match(new RegExp(`${fieldName}:\\s*(true|false)`))?.[1] ?? ''
}

function parseBundledSkillMetadata(source) {
  const firstMatch = pattern => source.match(pattern)?.[1] ?? ''
  return {
    name: firstMatch(/name:\s*'([^']+)'/),
    description:
      firstMatch(/description:\s*`([^`]+)`/) || firstMatch(/description:\s*'([^']+)'/),
    aliases: parseSimpleStringArray(source, 'aliases'),
    userInvocable: parseBooleanField(source, 'userInvocable'),
    disableModelInvocation: parseBooleanField(source, 'disableModelInvocation'),
    hasIsEnabled: source.includes('isEnabled:'),
  }
}

function parseBuiltinPluginMetadata(source) {
  const firstMatch = pattern => source.match(pattern)?.[1] ?? ''
  return {
    name: firstMatch(/name:\s*'([^']+)'/),
    description:
      firstMatch(/description:\s*`([^`]+)`/) || firstMatch(/description:\s*'([^']+)'/),
    defaultEnabled: parseBooleanField(source, 'defaultEnabled'),
    hasIsAvailable: source.includes('isAvailable:'),
    hasSkills: source.includes('skills:'),
  }
}

function parseBuildFeatures(source) {
  const body = extractArrayBodyFromAnchor(source, 'const buildFeatures =')
  return splitTopLevelCommaList(body)
    .map(item => item.match(/'([^']+)'/)?.[1] ?? '')
    .filter(Boolean)
}

function inferFamilyName(specifier) {
  const relative = specifier.replace(/^\.\//, '')
  const withoutIndex = relative.replace(/\/index\.js$/, '')
  const withoutExt = withoutIndex.replace(/\.js$/, '')
  const base = path.basename(withoutExt)
  return base === 'remoteControlServer' ? '' : base
}

function parseImports(source) {
  const map = new Map()

  for (const match of source.matchAll(
    /^import\s+([A-Za-z_$][\w$]*)\s+from\s+'(\.\/commands\/[^']+)'/gm,
  )) {
    map.set(match[1], { specifier: match[2], gate: 'always', importKind: 'default' })
  }

  for (const match of source.matchAll(
    /^import\s+\{([^}]+)\}\s+from\s+'(\.\/commands\/[^']+)'/gm,
  )) {
    const names = match[1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => s.split(/\s+as\s+/)[0].trim())
    for (const name of names) {
      map.set(name, { specifier: match[2], gate: 'always', importKind: 'named' })
    }
  }

  for (const match of source.matchAll(
    /^import\s+([A-Za-z_$][\w$]*)\s*,\s*\{([^}]+)\}\s+from\s+'(\.\/commands\/[^']+)'/gm,
  )) {
    map.set(match[1], { specifier: match[3], gate: 'always', importKind: 'default' })
    const names = match[2]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => s.split(/\s+as\s+/)[0].trim())
    for (const name of names) {
      map.set(name, { specifier: match[3], gate: 'always', importKind: 'named' })
    }
  }

  return map
}

function parseRelativeImports(source) {
  const map = new Map()
  for (const match of source.matchAll(/^import\s+\{([^}]+)\}\s+from\s+'(\.[^']+)'/gm)) {
    const names = match[1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => s.split(/\s+as\s+/)[0].trim())
    for (const name of names) {
      map.set(name, match[2])
    }
  }
  return map
}

function parseRelativeRequires(source) {
  const map = new Map()
  for (const match of source.matchAll(/const\s+\{([^}]+)\}\s*=\s*require\('(\.[^']+)'\)/gm)) {
    const names = match[1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => s.split(/\s+as\s+/)[0].trim())
    for (const name of names) {
      map.set(name, match[2])
    }
  }
  return map
}

function parseConditionalRequires(source) {
  const map = new Map()
  const decls = [...source.matchAll(/^const\s+([A-Za-z_$][\w$]*)\s*=/gm)]

  for (let i = 0; i < decls.length; i += 1) {
    const match = decls[i]
    const symbol = match[1]
    const start = match.index ?? 0
    const end = i + 1 < decls.length ? decls[i + 1].index ?? source.length : source.length
    const segment = source.slice(start, end)
    const specifier = segment.match(/require\('(\.\/commands\/[^']+)'\)/)?.[1]
    if (!specifier || !segment.includes(': null')) continue

    const afterEquals = segment.slice(segment.indexOf('=') + 1)
    const questionIndex = afterEquals.indexOf('?')
    if (questionIndex === -1) continue

    map.set(symbol, {
      specifier,
      gate: afterEquals.slice(0, questionIndex).replace(/\s+/g, ' ').trim(),
      importKind: 'conditional',
    })
  }

  return map
}

function parseArraySymbols(blockSource) {
  const entries = []
  for (const item of splitTopLevelCommaList(blockSource)) {
    const line = item.trim()
    if (!line || line.startsWith('//')) continue

    let match = line.match(/^\.\.\.\(([\s\S]+?)\?\s*\[([\s\S]+?)\]\s*:\s*\[\]\)$/)
    if (match) {
      const gate = match[1].trim()
      const spreadItems = splitTopLevelCommaList(match[2])
      for (const spreadItem of spreadItems) {
        entries.push({
          symbol: spreadItem.replace(/\(\)$/, '').trim(),
          entryExpr: spreadItem.trim(),
          gate,
        })
      }
      continue
    }

    match = line.match(/^([A-Za-z_$][\w$]*(?:\(\))?)$/)
    if (match) {
      const entryExpr = match[1]
      entries.push({ symbol: entryExpr.replace(/\(\)$/, ''), entryExpr, gate: '' })
    }
  }
  return entries
}

function findCallObjectSource(source, calleeName) {
  const regex = new RegExp(`\\b${calleeName}\\s*\\(`, 'm')
  const match = regex.exec(source)
  if (!match) return null
  const braceStart = source.indexOf('{', match.index)
  if (braceStart === -1) return null
  return extractBalancedSegment(source, braceStart, '{', '}')
}

function findInlineCommandObjectSource(source, symbol) {
  const regex = new RegExp(`(?:export\\s+)?const\\s+${symbol}\\b[\\s\\S]*?=\\s*`, 'm')
  const match = regex.exec(source)
  if (!match) return null
  const startIndex = match.index + match[0].length
  const trimmedStart = source.slice(startIndex).match(/^\s*/)
  const valueStart = startIndex + (trimmedStart?.[0].length ?? 0)
  if (source[valueStart] !== '{') return null
  const firstBrace = valueStart
  return extractBalancedSegment(source, firstBrace, '{', '}')
}

function findDefaultExportObjectSource(source) {
  const directObjectMatch = /export\s+default\s*\{/.exec(source)
  if (directObjectMatch) {
    const braceStart = source.indexOf('{', directObjectMatch.index)
    return extractBalancedSegment(source, braceStart, '{', '}')
  }

  const factoryObjectMatch = /export\s+default\s+[A-Za-z_$][\w$]*\(\s*\{/.exec(source)
  if (factoryObjectMatch) {
    const braceStart = source.indexOf('{', factoryObjectMatch.index)
    return extractBalancedSegment(source, braceStart, '{', '}')
  }

  const defaultArrowMatch = /export\s+default[\s\S]*?=>\s*\(/.exec(source)
  if (defaultArrowMatch) {
    const braceStart = source.indexOf('{', defaultArrowMatch.index)
    if (braceStart !== -1) return extractBalancedSegment(source, braceStart, '{', '}')
  }

  const exportedName = source.match(/export\s+default\s+([A-Za-z_$][\w$]*)/)
  if (exportedName) {
    return findInlineCommandObjectSource(source, exportedName[1])
  }

  return null
}

function findCommandObjectSource({ source, symbol, importKind, entryExpr, isInline }) {
  if (isInline) return findInlineCommandObjectSource(source, symbol)

  if (importKind === 'named') {
    return findInlineCommandObjectSource(source, symbol)
  }

  if (entryExpr.endsWith('()')) {
    return findDefaultExportObjectSource(source)
  }

  return findDefaultExportObjectSource(source) ?? findInlineCommandObjectSource(source, symbol)
}

function findIfBlocks(source) {
  const blocks = []
  const regex = /\bif\s*\(/g
  let match
  while ((match = regex.exec(source)) !== null) {
    const parenStart = source.indexOf('(', match.index)
    const parenEnd = findMatchingDelimiter(source, parenStart, '(', ')')
    const braceStart = source.indexOf('{', parenEnd)
    if (braceStart === -1) continue
    const bodySource = extractBalancedSegment(source, braceStart, '{', '}')
    blocks.push({
      gate: source.slice(parenStart + 1, parenEnd).replace(/\s+/g, ' ').trim(),
      start: match.index,
      end: braceStart + bodySource.length,
      body: bodySource.slice(1, -1),
    })
    regex.lastIndex = braceStart + bodySource.length
  }
  return blocks
}

function stripRanges(source, ranges) {
  if (ranges.length === 0) return source
  let result = ''
  let cursor = 0
  for (const range of ranges) {
    result += source.slice(cursor, range.start)
    result += '\n'.repeat((source.slice(range.start, range.end).match(/\n/g) ?? []).length)
    cursor = range.end
  }
  result += source.slice(cursor)
  return result
}

function parseRegistrationCalls(source, localImportMap, gate = 'always') {
  const rows = []
  for (const match of source.matchAll(/\b(register[A-Za-z_$][\w$]*)\(\)/g)) {
    const symbol = match[1]
    if (symbol === 'registerBundledSkill' || symbol === 'registerBuiltinPlugin') continue
    const specifier = localImportMap.get(symbol)
    if (!specifier) continue
    rows.push({ symbol, specifier, gate })
  }
  return rows
}

function resolveGate(entry, importInfo) {
  const rawGate = entry.gate || importInfo?.gate || 'always'
  if (/^[A-Za-z_$][\w$]*$/.test(rawGate)) {
    const referenced = importMap.get(rawGate)
    if (referenced?.gate && referenced.gate !== 'always') {
      return `${rawGate} => ${referenced.gate}`
    }
  }
  return rawGate
}

const importMap = new Map([
  ...parseImports(commandsSource),
  ...parseConditionalRequires(commandsSource),
])

const internalBlock = extractArrayBodyFromAnchor(
  commandsSource,
  'export const INTERNAL_ONLY_COMMANDS =',
)
const commandsBlock = extractArrayBodyFromAnchor(
  commandsSource,
  'const COMMANDS = memoize((): Command[] =>',
)

const internalEntries = parseArraySymbols(internalBlock).map(entry => ({
  ...entry,
  registryScope: 'internal_only',
}))

const commandEntries = parseArraySymbols(commandsBlock)
  .filter(entry => entry.entryExpr !== 'INTERNAL_ONLY_COMMANDS')
  .map(entry => ({
    ...entry,
    registryScope: 'commands',
  }))

const allEntries = [...internalEntries, ...commandEntries]

const appendixRows = []
for (const entry of allEntries) {
  const importInfo = importMap.get(entry.symbol)
  const specifier = importInfo?.specifier ?? ''
  const resolvedPath = specifier ? await resolveExistingCommandModule(specifier) : null
  const fileSource = resolvedPath ? await fs.readFile(resolvedPath, 'utf8') : ''
  let objectSource
  try {
    objectSource = resolvedPath
      ? findCommandObjectSource({
          source: fileSource,
          symbol: entry.symbol,
          importKind: importInfo?.importKind ?? '',
          entryExpr: entry.entryExpr,
          isInline: false,
        })
      : findCommandObjectSource({
          source: commandsSource,
          symbol: entry.symbol,
          importKind: '',
          entryExpr: entry.entryExpr,
          isInline: true,
        })
  } catch (error) {
    const location = resolvedPath ? cleanPath(resolvedPath) : 'src/commands.ts'
    throw new Error(
      `Failed to parse command metadata for ${entry.symbol} (${entry.entryExpr}) from ${location}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const metadata = objectSource ? parseMetadata(objectSource) : null
  const rawStatus =
    !resolvedPath && !metadata ? 'missing_module'
    : !resolvedPath && metadata ? 'inline_command'
    : metadata?.name === 'stub' ? 'stub_module'
    : 'present_module'

  appendixRows.push({
    registryScope: entry.registryScope,
    symbol: entry.symbol,
    entryExpr: entry.entryExpr,
    registryGate: entry.gate || importInfo?.gate || '',
    importKind: importInfo?.importKind ?? '',
    moduleSpecifier: specifier,
    modulePath:
      resolvedPath ? cleanPath(resolvedPath)
      : objectSource ? 'src/commands.ts (inline)'
      : '(missing)',
    sourceExists: Boolean(resolvedPath),
    rawStatus,
    slashName: metadata?.name && metadata.name !== 'stub'
      ? `/${metadata.name}`
      : inferFamilyName(specifier)
        ? `/${inferFamilyName(specifier)}`
        : '(unknown)',
    declaredName: metadata?.name ?? '',
    type: metadata?.type ?? '',
    aliases: (metadata?.aliases ?? []).join(', '),
    availability: (metadata?.availability ?? []).join(', '),
    hidden: metadata?.hiddenKind ?? '',
    immediate: metadata?.immediate ?? '',
    hasIsEnabled: metadata?.hasIsEnabled ? 'yes' : '',
    argumentHint: metadata?.argumentHint ?? '',
    description: metadata?.description ?? '',
    gate: resolveGate(entry, importInfo),
  })
}

async function collectBundledSkillRows() {
  const source = await fs.readFile(bundledSkillsIndexPath, 'utf8')
  const importMap = parseRelativeImports(source)
  const blocks = findIfBlocks(source)
  const seen = new Set()
  const rows = []

  for (const block of blocks) {
    const blockImportMap = new Map([
      ...importMap,
      ...parseRelativeRequires(block.body),
    ])
    for (const row of parseRegistrationCalls(block.body, blockImportMap, block.gate)) {
      const key = `${row.symbol}:${row.gate}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(row)
    }
  }

  const topLevelSource = stripRanges(source, blocks)
  for (const row of parseRegistrationCalls(topLevelSource, importMap, 'always')) {
    const key = `${row.symbol}:${row.gate}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(row)
  }

  const detailedRows = []
  for (const row of rows) {
    const resolvedPath = await resolveExistingModuleFrom(bundledSkillsIndexPath, row.specifier)
    const moduleSource = resolvedPath ? await fs.readFile(resolvedPath, 'utf8') : ''
    const definitionSource = moduleSource ? findCallObjectSource(moduleSource, 'registerBundledSkill') : null
    const metadata = definitionSource ? parseBundledSkillMetadata(definitionSource) : null
    detailedRows.push({
      kind: 'bundled_skill',
      symbol: row.symbol,
      item: metadata?.name ? `/${metadata.name}` : inferFamilyName(row.specifier) ? `/${inferFamilyName(row.specifier)}` : '(unknown)',
      modulePath: resolvedPath ? cleanPath(resolvedPath) : '(missing)',
      rawStatus: resolvedPath ? 'present_module' : 'missing_module',
      aliases: (metadata?.aliases ?? []).join(', '),
      userInvocable: metadata?.userInvocable || 'default_true',
      disableModelInvocation: metadata?.disableModelInvocation || 'false',
      hasIsEnabled: metadata?.hasIsEnabled ? 'yes' : '',
      gate: row.gate,
    })
  }

  detailedRows.sort((a, b) => a.item.localeCompare(b.item) || a.symbol.localeCompare(b.symbol))
  return detailedRows
}

async function collectBuiltinPluginRows() {
  const source = await fs.readFile(builtinPluginsInitPath, 'utf8')
  const rows = []
  for (const match of source.matchAll(/registerBuiltinPlugin\(\s*\{/g)) {
    const objectSource = findCallObjectSource(source.slice(match.index), 'registerBuiltinPlugin')
    if (!objectSource) continue
    const metadata = parseBuiltinPluginMetadata(objectSource)
    rows.push({
      kind: 'builtin_plugin',
      item: metadata.name ? metadata.name : '(unknown)',
      modulePath: cleanPath(builtinPluginsInitPath),
      rawStatus: 'present_definition',
      defaultEnabled: metadata.defaultEnabled || 'default_true',
      hasIsAvailable: metadata.hasIsAvailable ? 'yes' : '',
      hasSkills: metadata.hasSkills ? 'yes' : '',
    })
  }

  if (rows.length === 0) {
    rows.push({
      kind: 'builtin_plugin_registry',
      item: '(none registered)',
      modulePath: cleanPath(builtinPluginsInitPath),
      rawStatus: 'empty_registry',
      defaultEnabled: '',
      hasIsAvailable: '',
      hasSkills: '',
    })
  }

  return rows
}

async function collectDynamicSystemRows() {
  const systems = [
    {
      system: 'skill_dir_commands',
      modulePath: 'src/skills/loadSkillsDir.ts',
      produces: 'managed/user/project/additional skill dirs + legacy /commands skills',
      notes: 'includes conditional path-activated skills and dynamic skill discovery',
    },
    {
      system: 'dynamic_skills_runtime',
      modulePath: 'src/skills/loadSkillsDir.ts',
      produces: 'runtime-discovered nested .claude/skills content',
      notes: 'discoverSkillDirsForPaths/addSkillDirectories/getDynamicSkills',
    },
    {
      system: 'bundled_skills_registry',
      modulePath: 'src/skills/bundled/index.ts',
      produces: 'bundled prompt skills registered at startup',
      notes: 'feature-gated skill registration lives here',
    },
    {
      system: 'builtin_plugin_skill_registry',
      modulePath: 'src/plugins/builtinPlugins.ts',
      produces: 'skills from enabled built-in plugins',
      notes: 'registry exists; bundled built-in plugin init currently empty',
    },
    {
      system: 'plugin_commands',
      modulePath: 'src/utils/plugins/loadPluginCommands.ts',
      produces: 'plugin markdown commands + inline command metadata entries',
      notes: 'loads enabled plugins only',
    },
    {
      system: 'plugin_skills',
      modulePath: 'src/utils/plugins/loadPluginCommands.ts',
      produces: 'plugin skill directories and SKILL.md entries',
      notes: 'loads enabled plugins only',
    },
    {
      system: 'workflow_commands',
      modulePath: 'src/tools/WorkflowTool/createWorkflowCommand.ts',
      produces: 'workflow-generated slash commands',
      notes: 'loader referenced from src/commands.ts, source currently missing',
    },
    {
      system: 'mcp_skill_commands',
      modulePath: 'src/commands.ts',
      produces: 'MCP prompt skills extracted from AppState.mcp.commands',
      notes: 'gated by feature(MCP_SKILLS) in getMcpSkillCommands()',
    },
  ]

  const rows = []
  for (const system of systems) {
    const absPath = path.join(rootDir, system.modulePath)
    rows.push({
      ...system,
      rawStatus: (await fileExists(absPath)) ? 'present_module' : 'missing_module',
    })
  }
  return rows
}

async function runRuntimeDynamicProbe() {
  const preferredBun = process.env.BUN_BIN || path.join(process.env.HOME ?? '', '.bun', 'bin', 'bun')
  const bunBinary = (preferredBun && await fileExists(preferredBun)) ? preferredBun : 'bun'
  try {
    const output = execFileSync(bunBinary, [runtimeProbeRunnerPath], {
      cwd: rootDir,
      encoding: 'utf8',
    })
    return {
      probeStatus: 'ok',
      probeError: '',
      ...JSON.parse(output),
    }
  } catch (error) {
    const stderr =
      error && typeof error === 'object' && 'stderr' in error ? String(error.stderr || '') : ''
    const status =
      error && typeof error === 'object' && 'status' in error ? String(error.status ?? '') : ''
    return {
      probeStatus: 'error',
      probeError: [status ? `exit=${status}` : '', stderr.trim()].filter(Boolean).join(' '),
      cwd: rootDir,
      shouldAutoEnableClaudeInChrome: null,
      shouldAutoEnableClaudeInChromeStatus: 'error',
      shouldAutoEnableClaudeInChromeError: stderr.trim(),
      buckets: {},
      counts: {},
    }
  }
}

function evaluateBuildGate(gate, buildFeatureSet, runtimeProbe) {
  if (!gate || gate === 'always') return true
  let expression = gate
    .replace(/feature\('([^']+)'\)/g, (_, featureName) =>
      buildFeatureSet.has(featureName) ? 'true' : 'false')
    .replace(
      /shouldAutoEnableClaudeInChrome\(\)/g,
      typeof runtimeProbe.shouldAutoEnableClaudeInChrome === 'boolean'
        ? (runtimeProbe.shouldAutoEnableClaudeInChrome ? 'true' : 'false')
        : 'unknown',
    )

  if (/feature\(/.test(expression)) {
    return 'unknown'
  }

  try {
    return Boolean(Function(`return (${expression});`)())
  } catch {
    return 'unknown'
  }
}

appendixRows.sort((a, b) => {
  const scopeCmp = a.registryScope.localeCompare(b.registryScope)
  if (scopeCmp !== 0) return scopeCmp
  const nameCmp = a.slashName.localeCompare(b.slashName)
  if (nameCmp !== 0) return nameCmp
  return a.symbol.localeCompare(b.symbol)
})

const header = [
  'Registry scope',
  'Symbol',
  'Slash name',
  'Module',
  'Raw status',
  'Type',
  'Aliases',
  'Availability',
  'Hidden',
  'Immediate',
  'Gate',
]

function escapeCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')
}

const tableLines = [
  '| ' + header.join(' | ') + ' |',
  '| ' + header.map(() => '---').join(' | ') + ' |',
  ...appendixRows.map(row =>
    '| ' + [
      row.registryScope,
      row.symbol,
      row.slashName,
      row.modulePath,
      row.rawStatus,
      row.type,
      row.aliases,
      row.availability,
      row.hidden,
      row.immediate,
      row.gate,
    ].map(escapeCell).join(' | ') + ' |'
  ),
]

const bundledSkillRows = await collectBundledSkillRows()
const builtinPluginRows = await collectBuiltinPluginRows()
const dynamicSystemRows = await collectDynamicSystemRows()
const runtimeProbe = await runRuntimeDynamicProbe()
const buildFeatures = parseBuildFeatures(buildSource)
const buildFeatureSet = new Set(buildFeatures)

const bundledRuntimeRows = bundledSkillRows.map(row => {
  const gateActive = evaluateBuildGate(row.gate, buildFeatureSet, runtimeProbe)
  const runtimeStatus =
    row.rawStatus !== 'present_module' ? 'blocked_missing_module'
    : gateActive === true ? 'active_in_current_build'
    : gateActive === false ? 'inactive_in_current_build'
    : 'unknown_gate_state'
  return {
    item: row.item,
    modulePath: row.modulePath,
    rawStatus: row.rawStatus,
    gate: row.gate,
    gateActive: String(gateActive),
    runtimeStatus,
  }
})

const runtimeBucketRows = Object.entries(runtimeProbe.counts ?? {}).map(([bucket, count]) => ({
  bucket,
  count,
}))

const runtimeCommandRows = Object.entries(runtimeProbe.buckets ?? {})
  .flatMap(([bucket, commands]) =>
    commands.map(command => ({
      bucket,
      ...command,
    }))
  )
  .sort((a, b) => a.bucket.localeCompare(b.bucket) || a.name.localeCompare(b.name))

const bundledSkillHeader = [
  'Dynamic kind',
  'Symbol',
  'Item',
  'Module',
  'Raw status',
  'Aliases',
  'User invocable',
  'Model invocation disabled',
  'Has isEnabled',
  'Gate',
]

const bundledSkillLines = [
  '| ' + bundledSkillHeader.join(' | ') + ' |',
  '| ' + bundledSkillHeader.map(() => '---').join(' | ') + ' |',
  ...bundledSkillRows.map(row =>
    '| ' + [
      row.kind,
      row.symbol,
      row.item,
      row.modulePath,
      row.rawStatus,
      row.aliases,
      row.userInvocable,
      row.disableModelInvocation,
      row.hasIsEnabled,
      row.gate,
    ].map(escapeCell).join(' | ') + ' |'
  ),
]

const builtinPluginHeader = [
  'Dynamic kind',
  'Item',
  'Module',
  'Raw status',
  'Default enabled',
  'Has isAvailable',
  'Has skills',
]

const builtinPluginLines = [
  '| ' + builtinPluginHeader.join(' | ') + ' |',
  '| ' + builtinPluginHeader.map(() => '---').join(' | ') + ' |',
  ...builtinPluginRows.map(row =>
    '| ' + [
      row.kind,
      row.item,
      row.modulePath,
      row.rawStatus,
      row.defaultEnabled,
      row.hasIsAvailable,
      row.hasSkills,
    ].map(escapeCell).join(' | ') + ' |'
  ),
]

const dynamicSystemHeader = [
  'System',
  'Module',
  'Raw status',
  'Produces',
  'Notes',
]

const dynamicSystemLines = [
  '| ' + dynamicSystemHeader.join(' | ') + ' |',
  '| ' + dynamicSystemHeader.map(() => '---').join(' | ') + ' |',
  ...dynamicSystemRows.map(row =>
    '| ' + [
      row.system,
      row.modulePath,
      row.rawStatus,
      row.produces,
      row.notes,
    ].map(escapeCell).join(' | ') + ' |'
  ),
]

const runtimeSummaryHeader = ['Field', 'Value']
const chromeAutoEnableSummary =
  runtimeProbe.shouldAutoEnableClaudeInChromeStatus === 'ok'
    ? String(Boolean(runtimeProbe.shouldAutoEnableClaudeInChrome))
    : `error: ${runtimeProbe.shouldAutoEnableClaudeInChromeError || 'unavailable'}`
const runtimeSummaryRows = [
  ['probeStatus', runtimeProbe.probeStatus ?? 'unknown'],
  ['probeError', runtimeProbe.probeError ?? ''],
  ['cwd', runtimeProbe.cwd ?? rootDir],
  ['shouldAutoEnableClaudeInChrome()', chromeAutoEnableSummary],
  ['buildFeatures', buildFeatures.join(', ')],
]
const runtimeSummaryLines = [
  '| ' + runtimeSummaryHeader.join(' | ') + ' |',
  '| ' + runtimeSummaryHeader.map(() => '---').join(' | ') + ' |',
  ...runtimeSummaryRows.map(row => '| ' + row.map(escapeCell).join(' | ') + ' |'),
]

const runtimeBucketHeader = ['Bucket', 'Count']
const runtimeBucketLines = [
  '| ' + runtimeBucketHeader.join(' | ') + ' |',
  '| ' + runtimeBucketHeader.map(() => '---').join(' | ') + ' |',
  ...runtimeBucketRows.map(row =>
    '| ' + [row.bucket, row.count].map(escapeCell).join(' | ') + ' |'
  ),
]

const bundledRuntimeHeader = [
  'Bundled skill',
  'Module',
  'Raw status',
  'Gate',
  'Gate active now',
  'Current build status',
]
const bundledRuntimeLines = [
  '| ' + bundledRuntimeHeader.join(' | ') + ' |',
  '| ' + bundledRuntimeHeader.map(() => '---').join(' | ') + ' |',
  ...bundledRuntimeRows.map(row =>
    '| ' + [
      row.item,
      row.modulePath,
      row.rawStatus,
      row.gate,
      row.gateActive,
      row.runtimeStatus,
    ].map(escapeCell).join(' | ') + ' |'
  ),
]

const runtimeCommandHeader = [
  'Bucket',
  'Name',
  'Type',
  'Source',
  'Loaded from',
  'Aliases',
  'Availability',
  'Hidden',
  'Enabled now',
  'Disable model invocation',
  'User invocable',
]
const runtimeCommandLines = [
  '| ' + runtimeCommandHeader.join(' | ') + ' |',
  '| ' + runtimeCommandHeader.map(() => '---').join(' | ') + ' |',
  ...(
    runtimeCommandRows.length > 0
      ? runtimeCommandRows.map(row =>
          '| ' + [
            row.bucket,
            row.name,
            row.type,
            row.source,
            row.loadedFrom,
            row.aliases.join(', '),
            row.availability.join(', '),
            row.hidden,
            row.enabledNow,
            row.disableModelInvocation,
            row.userInvocable,
          ].map(escapeCell).join(' | ') + ' |'
        )
      : ['| (none) |  |  |  |  |  |  |  |  |  |  |']
  ),
]

const generated = [
  '## Generated Registry Appendix',
  '',
  'This appendix is generated mechanically from [src/commands.ts](./src/commands.ts) and the referenced command modules.',
  '',
  `Generated by: \`scripts/generate_slash_command_appendix.mjs\``,
  '',
  '<!-- GENERATED_APPENDIX_START -->',
  ...tableLines,
  '<!-- GENERATED_APPENDIX_END -->',
  '',
  '## Generated Dynamic Systems Appendix',
  '',
  'This appendix is generated mechanically from the bundled skill registry, built-in plugin registry, and dynamic loader source files.',
  '',
  `Generated by: \`scripts/generate_slash_command_appendix.mjs\``,
  '',
  '### Bundled Skill Registrations',
  '',
  '<!-- GENERATED_DYNAMIC_BUNDLED_START -->',
  ...bundledSkillLines,
  '<!-- GENERATED_DYNAMIC_BUNDLED_END -->',
  '',
  '### Built-in Plugin Registrations',
  '',
  '<!-- GENERATED_DYNAMIC_PLUGINS_START -->',
  ...builtinPluginLines,
  '<!-- GENERATED_DYNAMIC_PLUGINS_END -->',
  '',
  '### Dynamic Loader Systems',
  '',
  '<!-- GENERATED_DYNAMIC_SYSTEMS_START -->',
  ...dynamicSystemLines,
  '<!-- GENERATED_DYNAMIC_SYSTEMS_END -->',
  '',
  '## Generated Runtime Dynamic Appendix',
  '',
  'This appendix combines build-resolved feature activation with a live Bun probe of the current workspace/session for dynamic loaders that do not depend on `bun:bundle` feature folding.',
  '',
  `Generated by: \`scripts/generate_slash_command_appendix.mjs\` + \`scripts/probe_runtime_dynamic_surface.ts\``,
  '',
  '### Runtime Probe Summary',
  '',
  '<!-- GENERATED_RUNTIME_SUMMARY_START -->',
  ...runtimeSummaryLines,
  '<!-- GENERATED_RUNTIME_SUMMARY_END -->',
  '',
  '### Runtime Dynamic Bucket Counts',
  '',
  '<!-- GENERATED_RUNTIME_BUCKETS_START -->',
  ...runtimeBucketLines,
  '<!-- GENERATED_RUNTIME_BUCKETS_END -->',
  '',
  '### Build-Resolved Bundled Skill Activation',
  '',
  '<!-- GENERATED_RUNTIME_BUNDLED_START -->',
  ...bundledRuntimeLines,
  '<!-- GENERATED_RUNTIME_BUNDLED_END -->',
  '',
  '### Current Workspace Dynamic Command Rows',
  '',
  '<!-- GENERATED_RUNTIME_COMMANDS_START -->',
  ...runtimeCommandLines,
  '<!-- GENERATED_RUNTIME_COMMANDS_END -->',
  '',
].join('\n')

const currentMatrix = await fs.readFile(matrixPath, 'utf8')
const sectionRegex = /## Generated Registry Appendix[\s\S]*$/m
const nextMatrix = sectionRegex.test(currentMatrix)
  ? currentMatrix.replace(sectionRegex, generated)
  : `${currentMatrix.trimEnd()}\n\n${generated}`

await fs.writeFile(matrixPath, nextMatrix)

console.log(`Updated ${cleanPath(matrixPath)} with ${appendixRows.length} registry rows.`)
