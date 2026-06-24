import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const codeRoot = path.resolve(import.meta.dir, '../..')

const leakChecks = [
  {
    relativePath: 'ncode',
    forbiddenSubstrings: ['Claude Code'],
  },
  {
    relativePath: 'ncode-staging',
    forbiddenSubstrings: ['Claude Code'],
  },
  {
    relativePath: 'ncode-staging-self-contained',
    forbiddenSubstrings: ['Claude Code'],
  },
  {
    relativePath: 'src/main.tsx',
    forbiddenSubstrings: [
      'when Claude is run',
      'Sets CLAUDE_CODE_SIMPLE=1',
      "e.g. 'sonnet' or 'opus'",
      "claude-sonnet-4-6",
    ],
  },
  {
    relativePath: 'src/constants/product.ts',
    forbiddenSubstrings: ['getClaudeAiBaseUrl('],
  },
  {
    relativePath: 'src/bridge/bridgeStatusUtil.ts',
    forbiddenSubstrings: ['getClaudeAiBaseUrl'],
  },
  {
    relativePath: 'src/utils/fullscreen.ts',
    forbiddenSubstrings: [
      'set CLAUDE_CODE_NO_FLICKER=1 to override',
      'CLAUDE_CODE_DISABLE_MOUSE=1',
      'CLAUDE_CODE_DISABLE_MOUSE_CLICKS=1',
    ],
  },
  {
    relativePath: 'src/bridge/bridgeApi.ts',
    forbiddenSubstrings: ['`claude remote-control`'],
  },
  {
    relativePath: 'src/bridge/types.ts',
    forbiddenSubstrings: ['`claude remote-control'],
  },
  {
    relativePath: 'src/bridge/bridgePointer.ts',
    forbiddenSubstrings: ['`claude remote-control'],
  },
  {
    relativePath: 'src/cli/print.ts',
    forbiddenSubstrings: ['Usage: claude -p --resume <session-id>'],
  },
  {
    relativePath: 'src/cli/handlers/autoMode.ts',
    forbiddenSubstrings: [
      'Claude Code',
      '`claude auto-mode',
      'when `claude auto-mode',
    ],
  },
  {
    relativePath: 'src/utils/completionCache.ts',
    forbiddenSubstrings: [
      'Run manually: claude completion',
      'Claude Code shell completions',
      'after `claude update`',
    ],
  },
  {
    relativePath: 'src/cli/update.ts',
    forbiddenSubstrings: ['claude install'],
  },
  {
    relativePath: 'src/components/AutoUpdater.tsx',
    forbiddenSubstrings: ['claude doctor'],
  },
  {
    relativePath: 'src/components/NativeAutoUpdater.tsx',
    forbiddenSubstrings: ['claude rollback'],
  },
  {
    relativePath: 'src/utils/http.ts',
    forbiddenSubstrings: [
      'claude-cli/',
      'claude-code/',
      'Claude-User',
      'support.anthropic.com',
    ],
  },
  {
    relativePath: 'src/utils/userAgent.ts',
    forbiddenSubstrings: ['claude-code/'],
  },
  {
    relativePath: 'src/services/analytics/firstPartyEventLogger.ts',
    forbiddenSubstrings: ["[ATTR_SERVICE_NAME]: 'claude-code'"],
  },
  {
    relativePath: 'src/services/analytics/firstPartyEventLoggingExporter.ts',
    forbiddenSubstrings: ["'x-service-name': 'claude-code'"],
  },
  {
    relativePath: 'src/utils/telemetry/instrumentation.ts',
    forbiddenSubstrings: ["[ATTR_SERVICE_NAME]: 'claude-code'"],
  },
  {
    relativePath: 'src/utils/telemetry/bigqueryExporter.ts',
    forbiddenSubstrings: ["|| 'claude-code'"],
  },
  {
    relativePath: 'src/utils/billing.ts',
    forbiddenSubstrings: [
      'hasClaudeAiBillingAccess',
      'hasClaudeAiBillingAccessForSession',
    ],
  },
  {
    relativePath: 'src/commands/extra-usage/extra-usage-core.ts',
    forbiddenSubstrings: [
      'https://claude.ai/settings/usage',
      'https://claude.ai/admin-settings/usage',
      'hasClaudeAiBillingAccess',
    ],
  },
  {
    relativePath: 'src/commands/upgrade/upgrade.tsx',
    forbiddenSubstrings: [
      'https://claude.ai/upgrade/max',
      'sourceMappingURL=data:',
    ],
  },
  {
    relativePath: 'src/components/messages/RateLimitMessage.tsx',
    forbiddenSubstrings: [
      'hasClaudeAiBillingAccess',
      'sourceMappingURL=data:',
    ],
  },
  {
    relativePath: 'src/hooks/notifs/useRateLimitWarningNotification.tsx',
    forbiddenSubstrings: [
      'hasClaudeAiBillingAccess',
      'sourceMappingURL=data:',
    ],
  },
  {
    relativePath: 'src/commands/rate-limit-options/rate-limit-options.tsx',
    forbiddenSubstrings: [
      'hasClaudeAiBillingAccess',
      'sourceMappingURL=data:',
    ],
  },
  {
    relativePath: 'src/services/rateLimitMessages.ts',
    forbiddenSubstrings: ['hasClaudeAiBillingAccess'],
  },
  {
    relativePath: 'src/commands/review/ultrareviewCommand.tsx',
    forbiddenSubstrings: [
      'https://claude.ai/settings/billing',
      'sourceMappingURL=data:',
    ],
  },
  {
    relativePath: 'src/components/grove/Grove.tsx',
    forbiddenSubstrings: [
      'Anthropic AI models',
      'https://claude.ai/settings/data-privacy-controls',
      'https://www.anthropic.com/news/updates-to-our-consumer-terms',
      'https://anthropic.com/legal/terms',
      'https://anthropic.com/legal/privacy',
      'sourceMappingURL=data:',
    ],
  },
  {
    relativePath: 'src/commands/privacy-settings/privacy-settings.tsx',
    forbiddenSubstrings: [
      'https://claude.ai/settings/data-privacy-controls',
      'FALLBACK_MESSAGE',
      'sourceMappingURL=data:',
    ],
  },
  {
    relativePath: 'src/services/api/grove.ts',
    forbiddenSubstrings: [
      'Run `claude` to review the updated terms',
      'You must run `claude` to review the updated terms',
      'Consumer Terms and Privacy Policy',
    ],
  },
  {
    relativePath: 'src/components/messages/AssistantTextMessage.tsx',
    forbiddenSubstrings: [
      'https://platform.claude.com/settings/billing',
      'sourceMappingURL=data:',
    ],
  },
  {
    relativePath: 'src/utils/teleport/gitBundle.ts',
    forbiddenSubstrings: ['https://claude.ai/code'],
  },
  {
    relativePath: 'src/hooks/notifs/useNpmDeprecationNotification.tsx',
    forbiddenSubstrings: [
      'docs.anthropic.com',
      'claude-code/getting-started',
      'sourceMappingURL=data:',
    ],
  },
  {
    relativePath: 'src/utils/releaseNotes.ts',
    forbiddenSubstrings: [
      'github.com/anthropics/claude-code',
      'raw.githubusercontent.com/anthropics/claude-code',
      'starts Claude',
    ],
  },
  {
    relativePath: 'src/components/Feedback.tsx',
    forbiddenSubstrings: [
      'github.com/anthropics/claude-cli-internal',
      'github.com/anthropics/claude-code',
      'sourceMappingURL=data:',
    ],
  },
  {
    relativePath: 'src/tools/AgentTool/built-in/ncodeGuideAgent.ts',
    forbiddenSubstrings: [
      'Claude Code',
      'Claude Agent SDK',
      'Claude API',
      'Anthropic API',
      'platform.claude.com',
      'code.claude.com',
      'haiku',
      'claude-code-guide',
    ],
  },
  {
    relativePath: 'src/tools/AgentTool/builtInAgents.ts',
    forbiddenSubstrings: [
      'claudeCodeGuideAgent',
      'CLAUDE_CODE_GUIDE_AGENT',
      'claude-code-guide',
    ],
  },
  {
    relativePath: 'src/skills/bundled/debug.ts',
    forbiddenSubstrings: [
      'Claude Code session',
      'claude --debug',
      'Claude Code features',
      'claudeCodeGuideAgent',
      'CLAUDE_CODE_GUIDE_AGENT',
    ],
  },
  {
    relativePath: 'src/utils/commitAttribution.ts',
    forbiddenSubstrings: [
      'github.com/anthropics',
      'claudePercent',
      'claudeChars',
      'claudeContribution',
      'claude-opus',
      'claude-sonnet',
      'claude-haiku',
      "return 'claude'",
    ],
  },
  {
    relativePath: 'src/utils/attribution.ts',
    forbiddenSubstrings: [
      'noreply@anthropic.com',
      'Claude Opus',
      'claude-opus',
      'claudePercent',
      'claudeChars',
    ],
  },
  {
    relativePath: 'src/utils/undercover.ts',
    forbiddenSubstrings: [
      'Anthropic-internal',
      'anthropics/',
      '#claude-code',
      'Claude Code',
      'Claude Opus',
      'Claude Capybara',
      'claude-opus',
    ],
  },
  {
    relativePath: 'src/types/logs.ts',
    forbiddenSubstrings: ['`claude ps`', 'claudeContribution'],
  },
  {
    relativePath: 'src/commands/desktop/index.ts',
    forbiddenSubstrings: [
      'Claude Desktop',
      "availability: ['claude-ai']",
    ],
  },
  {
    relativePath: 'src/components/DesktopHandoff.tsx',
    forbiddenSubstrings: [
      'Claude Desktop',
      'https://claude.ai',
      'sourceMappingURL=data:',
    ],
  },
  {
    relativePath: 'src/utils/desktopDeepLink.ts',
    forbiddenSubstrings: [
      'Claude Desktop',
      'https://claude.ai',
      'AnthropicClaude',
      'claude://',
      'claude-dev://',
    ],
  },
  {
    relativePath: 'src/commands/install-github-app/index.ts',
    forbiddenSubstrings: [
      'Claude GitHub Actions',
      "availability: ['claude-ai'",
    ],
  },
  {
    relativePath: 'src/constants/github-app.ts',
    forbiddenSubstrings: [
      'Claude Code',
      'Claude',
      'anthropics/',
      'ANTHROPIC_API_KEY',
      'anthropic_api_key',
      'https://code.claude.com',
    ],
  },
  {
    relativePath: 'src/commands/install-github-app/ExistingWorkflowStep.tsx',
    forbiddenSubstrings: [
      'Claude',
      'anthropics/',
      'sourceMappingURL=data:',
    ],
  },
  {
    relativePath: 'src/commands/install-github-app/ApiKeyStep.tsx',
    forbiddenSubstrings: [
      'Claude',
      'sk-ant',
      'platform.claude.com',
      'sourceMappingURL=data:',
    ],
  },
  {
    relativePath: 'src/commands/install-github-app/setupGitHubActions.ts',
    forbiddenSubstrings: [
      'Claude',
      'anthropics/',
      'ANTHROPIC_API_KEY',
      'anthropic_api_key',
    ],
  },
  {
    relativePath: 'src/components/WorkflowMultiselectDialog.tsx',
    forbiddenSubstrings: [
      'Claude',
      'anthropics/',
      'sourceMappingURL=data:',
    ],
  },
  {
    relativePath: 'src/commands/createMovedToPluginCommand.ts',
    forbiddenSubstrings: [
      'claude plugin install',
      'claude-code-marketplace',
      'anthropics/',
    ],
  },
  {
    relativePath: 'src/utils/plugins/officialMarketplace.ts',
    forbiddenSubstrings: [
      'Anthropic',
      'anthropics/',
      'claude-plugins-official',
    ],
  },
  {
    relativePath: 'src/utils/plugins/officialMarketplaceGcs.ts',
    forbiddenSubstrings: [
      'downloads.claude.ai',
      'claude-code-releases',
      'Anthropic',
      'anthropic#',
      'claude-plugins-official',
    ],
  },
  {
    relativePath: 'src/utils/plugins/officialMarketplaceStartupCheck.ts',
    forbiddenSubstrings: [
      'Anthropic',
      'anthropic#',
      'CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL',
    ],
  },
  {
    relativePath: 'src/utils/plugins/schemas.ts',
    forbiddenSubstrings: [
      'Anthropic',
      'anthropic',
      'claude-marketplace',
      'claude-plugins',
      'github.com/anthropics',
    ],
  },
  {
    relativePath: 'src/utils/model/model.ts',
    forbiddenSubstrings: [
      'getDefaultSonnetModel',
      'getConfiguredDefaultSonnetModelEnv',
      'DefaultSonnetModel',
      'defaultSonnet',
    ],
  },
  {
    relativePath: 'src/constants/system.ts',
    forbiddenSubstrings: [
      'You are Claude Code',
      "Anthropic's official CLI",
      'Claude Agent SDK',
    ],
  },
  {
    relativePath: 'src/constants/prompts.ts',
    forbiddenSubstrings: [
      'Get help with using Claude Code',
      'unexpected behavior with Claude Code',
      'Claude Code itself',
      'Claude Code is available',
      'Fast mode for Claude Code',
      'You are an agent for Claude Code',
      '#claude-code-feedback',
      'anthropics/claude-code',
    ],
  },
  {
    relativePath: 'src/coordinator/coordinatorMode.ts',
    forbiddenSubstrings: [
      'You are Claude Code',
      'anthropics/claude-code',
    ],
  },
  {
    relativePath: 'src/commands/ultraplan.tsx',
    forbiddenSubstrings: [
      'Claude Code on the web',
      'Claude on the web',
      'Opus',
    ],
  },
  {
    relativePath: 'src/commands/remote-setup/remote-setup.tsx',
    forbiddenSubstrings: [
      'Claude',
      'Claude on the web',
      'Claude account',
      'claude.ai',
      'sourceMappingURL=data:',
    ],
  },
  {
    relativePath: 'src/components/ResumeTask.tsx',
    forbiddenSubstrings: [
      'Claude account',
      'Claude Code',
    ],
  },
  {
    relativePath: 'src/components/tasks/RemoteSessionDetailDialog.tsx',
    forbiddenSubstrings: ['Claude Code on the web'],
  },
  {
    relativePath: 'src/utils/teleport.tsx',
    forbiddenSubstrings: [
      'Claude Haiku',
      'Run /status in Claude Code',
      'https://claude.ai/code',
    ],
  },
  {
    relativePath: 'src/bridge/createSession.ts',
    forbiddenSubstrings: [
      '`claude remote-control',
      'claude.ai/code',
    ],
  },
  {
    relativePath: 'package.json',
    forbiddenSubstrings: [
      '"code": "dist/cli.js"',
    ],
  },
  {
    relativePath: 'src/main.tsx',
    forbiddenSubstrings: [
      "program.name('code')",
      '(Code)',
      'Usage: code',
      '\\n  code rollback',
      'Install Code native build',
    ],
  },
  {
    relativePath: 'src/entrypoints/cli.tsx',
    forbiddenSubstrings: [
      '(Code)',
    ],
  },
  {
    relativePath: 'build/packageSmoke.mjs',
    forbiddenSubstrings: [
      'Usage: code',
      '(Code)',
    ],
  },
  {
    relativePath: 'src/utils/nativeInstaller/installer.ts',
    forbiddenSubstrings: [
      "'claude', 'versions'",
      "'claude', 'staging'",
      "'claude', 'locks'",
      'claude-cli-native-',
      'node_modules/@anthropic-ai',
    ],
  },
  {
    relativePath: 'src/utils/nativeInstaller/download.ts',
    forbiddenSubstrings: [
      'claude-native-installer',
      'claude-code-ci-sentinel',
      'claude-code-releases',
      'claude-code-dist-',
    ],
  },
  {
    relativePath: 'src/commands/install.tsx',
    forbiddenSubstrings: [
      '~/.local/bin/claude',
      'claude.exe',
    ],
  },
  {
    relativePath: 'src/cli/update.ts',
    forbiddenSubstrings: [
      "'which claude'",
    ],
  },
]

describe('default product identity audit', () => {
  for (const { relativePath, forbiddenSubstrings } of leakChecks) {
    it(`keeps ${relativePath} free of the forbidden legacy product strings for this wave`, () => {
      const targetPath = path.join(codeRoot, relativePath)
      if (!existsSync(targetPath)) {
        return
      }
      const content = readFileSync(targetPath, 'utf8')

      for (const forbidden of forbiddenSubstrings) {
        expect(content).not.toContain(forbidden)
      }
    })
  }
})
