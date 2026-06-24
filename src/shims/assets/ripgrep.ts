import type { MaterializedAsset } from '../nativeAssetRuntime.js'

import ripgrepArm64Darwin from '../../../node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/arm64-darwin/rg' with { type: 'file' }
import ripgrepArm64Linux from '../../../node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/arm64-linux/rg' with { type: 'file' }
import ripgrepArm64Win32 from '../../../node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/arm64-win32/rg.exe' with { type: 'file' }
import ripgrepX64Darwin from '../../../node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/x64-darwin/rg' with { type: 'file' }
import ripgrepX64Linux from '../../../node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/x64-linux/rg' with { type: 'file' }
import ripgrepX64Win32 from '../../../node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/x64-win32/rg.exe' with { type: 'file' }

export function getBundledRipgrepAsset(): MaterializedAsset | null {
  switch (`${process.arch}-${process.platform}`) {
    case 'arm64-darwin':
      return {
        embeddedPath: ripgrepArm64Darwin,
        relativePath: 'vendor/ripgrep/arm64-darwin/rg',
        mode: 0o755,
      }
    case 'arm64-linux':
      return {
        embeddedPath: ripgrepArm64Linux,
        relativePath: 'vendor/ripgrep/arm64-linux/rg',
        mode: 0o755,
      }
    case 'arm64-win32':
      return {
        embeddedPath: ripgrepArm64Win32,
        relativePath: 'vendor/ripgrep/arm64-win32/rg.exe',
      }
    case 'x64-darwin':
      return {
        embeddedPath: ripgrepX64Darwin,
        relativePath: 'vendor/ripgrep/x64-darwin/rg',
        mode: 0o755,
      }
    case 'x64-linux':
      return {
        embeddedPath: ripgrepX64Linux,
        relativePath: 'vendor/ripgrep/x64-linux/rg',
        mode: 0o755,
      }
    case 'x64-win32':
      return {
        embeddedPath: ripgrepX64Win32,
        relativePath: 'vendor/ripgrep/x64-win32/rg.exe',
      }
    default:
      return null
  }
}
