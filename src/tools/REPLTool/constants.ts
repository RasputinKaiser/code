import { isEnvDefinedFalsy, isEnvTruthy } from '../../utils/envUtils.js'
import { isInternalBuild } from 'src/capabilities/static.js'
export const REPL_TOOL_NAME = 'REPL'
export const JS_REPL_TOOL_NAME = 'js_repl'
export const JS_REPL_RESET_TOOL_NAME = 'js_repl_reset'
export const PY_REPL_TOOL_NAME = 'py_repl'
export const PY_REPL_RESET_TOOL_NAME = 'py_repl_reset'

function isCliLikeEntrypoint(): boolean {
  return (
    process.env.CLAUDE_CODE_ENTRYPOINT === 'cli' ||
    process.env.CLAUDE_CODE_ENTRYPOINT === 'sdk-cli'
  )
}

/**
 * REPL mode is opt-in for internal CLI runs. The direct tool surface (Bash,
 * Read, Edit, etc.) is the production path; REPL is only enabled when
 * explicitly requested via NCODE_REPL=1 or the legacy
 * CLAUDE_CODE_REPL=1 / CLAUDE_REPL_MODE=1. Headless sdk-cli may opt in, but
 * other SDK entrypoints stay off.
 */
export function isReplModeEnabled(): boolean {
  if (!isInternalBuild()) return false
  if (!isCliLikeEntrypoint()) return false
  if (isEnvDefinedFalsy(process.env.NCODE_REPL)) return false
  if (isEnvTruthy(process.env.NCODE_REPL)) return true
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_REPL)) return false
  if (isEnvTruthy(process.env.CLAUDE_CODE_REPL)) return true
  if (isEnvTruthy(process.env.CLAUDE_REPL_MODE)) return true
  return false
}

/**
 * js_repl is a separate, opt-in JavaScript kernel tool. Unlike REPL mode it
 * does not hide the direct tool surface.
 */
export function isJsReplEnabled(): boolean {
  if (!isInternalBuild()) return false
  if (!isCliLikeEntrypoint()) return false
  if (isEnvDefinedFalsy(process.env.NCODE_JS_REPL)) return false
  if (isEnvTruthy(process.env.NCODE_JS_REPL)) return true
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_JS_REPL)) return false
  if (isEnvTruthy(process.env.CLAUDE_CODE_JS_REPL)) return true
  return false
}

/**
 * py_repl requires a native host that is not part of the OSS export.
 */
export function isPyReplEnabled(): boolean {
  return false
}
