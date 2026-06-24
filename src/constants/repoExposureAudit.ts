import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const codeRoot = path.resolve(import.meta.dir, '../..')

const defaultScanRoots = [
  'package.json',
  'build',
  'scripts',
  'src/cli',
  'src/commands/install',
  'src/commands/install.tsx',
  'src/utils/nativeInstaller',
  'src/utils/telemetry',
  'src/utils/telemetryAttributes.ts',
  'src/utils/auth.ts',
  'src/utils/authEnv.ts',
  'src/utils/platformUrls.ts',
  'src/utils/model/providers.ts',
  'src/auth/runtime',
  'src/services/analytics',
  'src/services/oauth',
  'src/services/mcp/auth.ts',
  'src/constants',
  'src/entrypoints',
  'src/capabilities',
]

function defaultRoots(): string[] {
  return defaultScanRoots.map(relative => path.join(codeRoot, relative))
}

export function walkFiles(
  root: string,
  options: { skipDirs?: string[] } = {},
): string[] {
  const skipDirs = new Set(options.skipDirs ?? ['node_modules', 'dist', '.tmp'])
  const files: string[] = []
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()!
    const stats = statSync(current, { throwIfNoEntry: false })
    if (!stats) continue
    if (stats.isFile()) {
      if (
        current.endsWith('.ts') ||
        current.endsWith('.tsx') ||
        current.endsWith('.mjs') ||
        current.endsWith('.json') ||
        current.endsWith('.md')
      ) {
        files.push(current)
      }
      continue
    }
    if (stats.isDirectory()) {
      for (const entry of readdirSync(current)) {
        if (skipDirs.has(entry)) continue
        stack.push(path.join(current, entry))
      }
    }
  }
  return files
}

export function collectSourceFiles(
  roots: string[] = defaultRoots(),
  options: { skipDirs?: string[] } = {},
): string[] {
  const files: string[] = []
  for (const root of roots) {
    files.push(...walkFiles(root, options))
  }
  return [...new Set(files)].sort()
}

export interface ExposureRule {
  id: string
  description: string
  patterns: RegExp[]
}

function legacyLeakEnvPattern(): RegExp {
  const prefix = ['CLAUDE', 'CODE', 'LEAK'].join('_')
  return new RegExp(`\\b${prefix}_[A-Z_]+`)
}

function antPrivatePattern(): RegExp {
  return new RegExp('@' + 'ant' + '/')
}

function anthropicBucketPatterns(): RegExp[] {
  const releaseBucket = ['claude', 'code', 'releases'].join('-')
  const distPrefix = ['claude', 'code', 'dist'].join('-')
  return [
    new RegExp(`${distPrefix}-[a-f0-9-]+`),
    new RegExp(releaseBucket),
    new RegExp('storage\\.googleapis\\.com' + '/' + distPrefix.replace(/-/g, '[-\\.]')),
  ]
}

function stagingGrowthBookPattern(): RegExp {
  return new RegExp(
    'DEFAULT_NOUMENA_GROWTHBOOK_API_HOST' +
      '.*' +
      ['flags', 'staging', 'noumena', 'com'].join('\\.'),
  )
}

function activeInstallerClaudePatterns(): RegExp[] {
  const claude = ['claude'].join('')
  return [
    new RegExp(`~/\\.local/bin/${claude}`),
    new RegExp(`['"]${claude}\\.exe['"]`),
    new RegExp(
      `getBinaryName\\s*\\(\\s*[^)]*\\s*\\)\\s*=>\\s*['"]${claude}['"]`,
    ),
  ]
}

function notImplementedPatterns(): RegExp[] {
  return [
    new RegExp(`throw new Error\\(['"]Not implemented['"]\\)`),
    /\bunimplemented!\(\)/,
    /\bzeroed\(\)/,
  ]
}

function legacyTelemetryMetricsPathPattern(): RegExp {
  return /\/api\/claude_code\/metrics/
}

function anthropicOauthDefaultPatterns(): RegExp[] {
  return [
    /BASE_API_URL:\s*['"]https:\/\/api\.anthropic\.com['"]/,
    /MCP_PROXY_URL:\s*['"]https:\/\/mcp-proxy\.anthropic\.com['"]/,
    /https:\/\/platform\.claude\.com/,
    /CLIENT_ID:\s*['"]9d1c250a-e61b-44d9-88ed-5944d1962f5e['"]/,
  ]
}

function anthropicManagedSourceMarkerPattern(): RegExp {
  return /rawAuthTokenSource:\s*['"]claude\.ai['"]/
}

export function getHighConfidenceBlockerRules(): ExposureRule[] {
  return [
    {
      id: 'legacy-leak-env-namespace',
      description:
        'Legacy internal fallback env namespace must not appear in source',
      patterns: [legacyLeakEnvPattern()],
    },
    {
      id: 'private-ant-runtime-probes',
      description:
        'Private @ant/* runtime probes or imports must not ship in public builds',
      patterns: [antPrivatePattern()],
    },
    {
      id: 'anthropic-artifact-buckets',
      description:
        'Anthropic-owned artifact or release buckets must not be defaults',
      patterns: anthropicBucketPatterns(),
    },
    {
      id: 'staging-growthbook-default',
      description:
        'Staging GrowthBook host must not be hardcoded as a public default',
      patterns: [stagingGrowthBookPattern()],
    },
    {
      id: 'active-installer-claude-identity',
      description:
        'Active installer/updater paths must use ncode identity, not claude',
      patterns: activeInstallerClaudePatterns(),
    },
    {
      id: 'public-sdk-not-implemented',
      description:
        'Public SDK exports must not throw NotImplemented or be zeroed stubs',
      patterns: notImplementedPatterns(),
    },
    {
      id: 'legacy-telemetry-metrics-path',
      description:
        'Telemetry metrics sinks must use /api/ncode/metrics, not legacy route names',
      patterns: [legacyTelemetryMetricsPathPattern()],
    },
    {
      id: 'anthropic-oauth-public-defaults',
      description:
        'Anthropic-owned OAuth/inference endpoints must not be public defaults',
      patterns: anthropicOauthDefaultPatterns(),
    },
    {
      id: 'anthropic-managed-source-marker',
      description:
        'Managed OAuth sessions must report a Noumena source marker, not claude.ai',
      patterns: [anthropicManagedSourceMarkerPattern()],
    },
  ]
}

export interface AllowlistEntry {
  file: string
  ruleIds: string[]
  reason: string
  linePattern?: RegExp
}

export function getDefaultAllowlist(): AllowlistEntry[] {
  return [
    {
      file: 'src/constants/repoExposureAudit.ts',
      ruleIds: [
        'legacy-leak-env-namespace',
        'private-ant-runtime-probes',
        'anthropic-artifact-buckets',
        'staging-growthbook-default',
        'active-installer-claude-identity',
        'public-sdk-not-implemented',
        'legacy-telemetry-metrics-path',
        'anthropic-oauth-public-defaults',
        'anthropic-managed-source-marker',
      ],
      reason:
        'This audit module defines the rules and examples; the tokens appear only in rule metadata.',
    },
    {
      file: 'src/constants/repoExposureAudit.test.ts',
      ruleIds: [
        'legacy-leak-env-namespace',
        'private-ant-runtime-probes',
        'anthropic-artifact-buckets',
        'staging-growthbook-default',
        'active-installer-claude-identity',
        'public-sdk-not-implemented',
        'legacy-telemetry-metrics-path',
        'anthropic-oauth-public-defaults',
        'anthropic-managed-source-marker',
      ],
      reason:
        'Audit test references rule metadata and expected findings; the tokens are not product leaks.',
    },
    {
      file: 'src/utils/nativeInstaller/installer.ts',
      ruleIds: ['active-installer-claude-identity'],
      reason:
        'Legacy migration cleanup explicitly removes old claude.cmd, claude.ps1, claude.exe, and claude symlinks.',
      linePattern:
        /legacy (bin script|PowerShell script|bin executable|bin symlink)|claude\.cmd|claude\.ps1|claude\.exe\.old|['"]claude['"]/,
    },
    {
      file: 'src/constants/keys.ts',
      ruleIds: ['staging-growthbook-default'],
      reason:
        'Internal-only GrowthBook SDK key constants are gated behind isInternalBuild().',
    },
    {
      file: 'src/services/analytics/growthbookHost.ts',
      ruleIds: ['staging-growthbook-default'],
      reason:
        'Staging host is exported only as an example marker, not as a public default.',
    },
    {
      file: 'src/constants/oauth.ts',
      ruleIds: ['anthropic-oauth-public-defaults'],
      reason:
        'OAuth config contains only Noumena/FedStart endpoint defaults; any Anthropic string matches appear in parameter/scope names or allowlist entries, not public default values.',
      linePattern: /CLAUDE_AI|ALLOWED_OAUTH_BASE_URLS|fedstart|custom-oauth/,
    },
    {
      file: 'src/services/mcp/auth.ts',
      ruleIds: ['anthropic-oauth-public-defaults'],
      linePattern: /MCP_OAUTH_CLIENT_METADATA_URL|MCP_CLIENT_METADATA_URL/,
      reason:
        'MCP client metadata URL default supports Anthropic BYOK servers; Noumena-managed deployments override via MCP_OAUTH_CLIENT_METADATA_URL.',
    },
    {
      file: 'src/utils/model/providers.ts',
      ruleIds: ['anthropic-oauth-public-defaults'],
      linePattern: /FIRST_PARTY_ANTHROPIC_HOSTS|api-staging\.anthropic\.com/,
      reason:
        'First-party host allowlist recognizes Anthropic BYOK hosts as a compatibility facade, not as a public default.',
    },
    {
      file: 'src/constants/productIdentityAudit.test.ts',
      ruleIds: [
        'anthropic-artifact-buckets',
        'active-installer-claude-identity',
        'private-ant-runtime-probes',
        'legacy-leak-env-namespace',
        'anthropic-oauth-public-defaults',
        'anthropic-managed-source-marker',
      ],
      reason:
        'Product identity audit test intentionally references forbidden legacy strings to detect leaks.',
    },
  ]
}

function isAllowed(
  filePath: string,
  ruleId: string,
  line: string,
  allowlist: AllowlistEntry[],
): boolean {
  const relativeFile = path.relative(codeRoot, filePath)
  for (const entry of allowlist) {
    if (relativeFile !== entry.file) continue
    if (!entry.ruleIds.includes(ruleId)) continue
    if (entry.linePattern && !entry.linePattern.test(line)) continue
    return true
  }
  return false
}

export interface ExposureFinding {
  file: string
  line: number
  ruleId: string
  description: string
  snippet: string
}

export interface AuditOptions {
  roots?: string[]
  rules?: ExposureRule[]
  allowlist?: AllowlistEntry[]
  skipDirs?: string[]
}

export function runExposureAudit(options: AuditOptions = {}): ExposureFinding[] {
  const roots = options.roots ?? defaultRoots()
  const rules = options.rules ?? getHighConfidenceBlockerRules()
  const allowlist = options.allowlist ?? getDefaultAllowlist()
  const skipDirs = options.skipDirs

  const findings: ExposureFinding[] = []
  const files = collectSourceFiles(roots, { skipDirs })
  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    const lines = content.split('\n')
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex]!
      for (const rule of rules) {
        for (const pattern of rule.patterns) {
          if (pattern.test(line) && !isAllowed(file, rule.id, line, allowlist)) {
            findings.push({
              file: path.relative(codeRoot, file),
              line: lineIndex + 1,
              ruleId: rule.id,
              description: rule.description,
              snippet: line.trim(),
            })
          }
        }
      }
    }
  }
  return findings
}

export function formatFindings(findings: ExposureFinding[]): string {
  const grouped = new Map<string, ExposureFinding[]>()
  for (const finding of findings) {
    const list = grouped.get(finding.ruleId) ?? []
    list.push(finding)
    grouped.set(finding.ruleId, list)
  }
  const parts: string[] = []
  for (const [ruleId, list] of [...grouped.entries()].sort()) {
    parts.push(`\n${ruleId}: ${list[0]!.description}`)
    for (const finding of list) {
      parts.push(
        `  ${finding.file}:${finding.line}: ${finding.snippet.slice(0, 120)}`,
      )
    }
  }
  return parts.join('\n')
}
