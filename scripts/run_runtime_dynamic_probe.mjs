import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const runtimeProbePath = path.join(rootDir, 'scripts', 'probe_runtime_dynamic_surface.ts')
const buildScriptPath = path.join(rootDir, 'build', 'build.mjs')
const buildSource = await readFile(buildScriptPath, 'utf8')

function extractArrayBodyFromAnchor(source, anchor) {
  const anchorIndex = source.indexOf(anchor)
  if (anchorIndex === -1) throw new Error(`Unable to find anchor: ${anchor}`)
  const bracketStart = source.indexOf('[', anchorIndex + anchor.length)
  if (bracketStart === -1) throw new Error(`Unable to find array start for anchor: ${anchor}`)
  let depth = 0
  for (let i = bracketStart; i < source.length; i += 1) {
    const char = source[i]
    if (char === '[') depth += 1
    if (char === ']') {
      depth -= 1
      if (depth === 0) return source.slice(bracketStart + 1, i)
    }
  }
  throw new Error(`Unable to parse array body for anchor: ${anchor}`)
}

function parseBuildFeatures(source) {
  return [...extractArrayBodyFromAnchor(source, 'const buildFeatures =').matchAll(/'([^']+)'/g)]
    .map(match => match[1])
    .filter(Boolean)
}

function resolveSourceImport(specifier) {
  if (!specifier.startsWith('src/')) {
    return null
  }

  const absolutePath = path.join(rootDir, specifier)
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

  return candidates.find(candidate => existsSync(candidate)) ?? absolutePath
}

const srcAliasPlugin = {
  name: 'src-alias',
  setup(build) {
    build.onResolve({ filter: /^src\// }, args => ({
      path: resolveSourceImport(args.path),
    }))
  },
}

const privatePackageShimPlugin = {
  name: 'private-package-shims',
  setup(build) {
    build.onResolve({ filter: /^@ant\/claude-for-chrome-mcp$/ }, () => ({
      path: path.join(rootDir, 'src', 'shims', 'claudeForChromeMcp.ts'),
    }))
  },
}

const chromeMcpPackagePath = path.join(rootDir, 'node_modules', '@ant', 'claude-for-chrome-mcp')
const hasChromeMcpPackage = existsSync(chromeMcpPackagePath)
const buildFeatures = parseBuildFeatures(buildSource)
const tmpOutDir = await mkdtemp(path.join(tmpdir(), 'cc-runtime-probe-'))

try {
  const result = await Bun.build({
    entrypoints: [runtimeProbePath],
    outdir: tmpOutDir,
    root: rootDir,
    target: 'node',
    format: 'esm',
    packages: 'bundle',
    features: buildFeatures,
    plugins: hasChromeMcpPackage
      ? [srcAliasPlugin]
      : [srcAliasPlugin, privatePackageShimPlugin],
    loader: {
      '.md': 'text',
      '.txt': 'text',
    },
    define: {
      'process.env.USER_TYPE': JSON.stringify(process.env.NCODE_USER_TYPE ?? 'external'),
      'process.env.CLAUDE_CODE_VERIFY_PLAN': JSON.stringify(
        process.env.NCODE_VERIFY_PLAN ?? process.env.CLAUDE_CODE_VERIFY_PLAN ?? 'false',
      ),
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
  })

  if (!result.success) {
    for (const log of result.logs) {
      console.error(log)
    }
    process.exit(1)
  }

  const builtProbePath = path.join(tmpOutDir, 'scripts', 'probe_runtime_dynamic_surface.js')
  const stdout = execFileSync(Bun.argv[0], [builtProbePath], {
    cwd: rootDir,
    encoding: 'utf8',
  })
  process.stdout.write(stdout)
} finally {
  await rm(tmpOutDir, { recursive: true, force: true })
}
