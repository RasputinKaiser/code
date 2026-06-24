/**
 * Cross-platform terminal clearing with scrollback support.
 * Detects modern terminals that support ESC[3J for clearing scrollback.
 */

import {
  CURSOR_HOME,
  csi,
  ERASE_SCREEN,
  ERASE_SCROLLBACK,
} from './termio/csi.js'
import type { FlickerReason } from './frame.js'

// HVP (Horizontal Vertical Position) - legacy Windows cursor home
const CURSOR_HOME_WINDOWS = csi(0, 'f')

function isWindowsTerminal(): boolean {
  return process.platform === 'win32' && !!process.env.WT_SESSION
}

function isMintty(): boolean {
  // mintty 3.1.5+ sets TERM_PROGRAM to 'mintty'
  if (process.env.TERM_PROGRAM === 'mintty') {
    return true
  }
  // GitBash/MSYS2/MINGW use mintty and set MSYSTEM
  if (process.platform === 'win32' && process.env.MSYSTEM) {
    return true
  }
  return false
}

function isModernWindowsTerminal(): boolean {
  // Windows Terminal sets WT_SESSION environment variable
  if (isWindowsTerminal()) {
    return true
  }

  // VS Code integrated terminal on Windows with ConPTY support
  if (
    process.platform === 'win32' &&
    process.env.TERM_PROGRAM === 'vscode' &&
    process.env.TERM_PROGRAM_VERSION
  ) {
    return true
  }

  // mintty (GitBash/MSYS2/Cygwin) supports modern escape sequences
  if (isMintty()) {
    return true
  }

  return false
}

/**
 * Returns the ANSI escape sequence to clear the terminal including scrollback.
 * Automatically detects terminal capabilities.
 */
export function getClearTerminalSequence(): string {
  if (process.platform === 'win32') {
    if (isModernWindowsTerminal()) {
      return ERASE_SCREEN + ERASE_SCROLLBACK + CURSOR_HOME
    } else {
      // Legacy Windows console - can't clear scrollback
      return ERASE_SCREEN + CURSOR_HOME_WINDOWS
    }
  }
  return ERASE_SCREEN + ERASE_SCROLLBACK + CURSOR_HOME
}

/**
 * Returns the ANSI escape sequence to clear only the visible screen.
 * Used for resize recovery where scrollback preservation is preferable to a
 * destructive scrollback wipe.
 */
export function getClearVisibleTerminalSequence(): string {
  if (process.platform === 'win32') {
    if (isModernWindowsTerminal()) {
      return ERASE_SCREEN + CURSOR_HOME
    } else {
      return ERASE_SCREEN + CURSOR_HOME_WINDOWS
    }
  }
  return ERASE_SCREEN + CURSOR_HOME
}

/**
 * Pick the reset sequence for an internal repaint reason.
 *
 * `resize` only needs the visible viewport cleared before the repaint.
 * `offscreen` also uses the visible-only reset now: preserving scrollback and
 * avoiding the more destructive `CSI 3 J` path is preferable to keeping
 * unreachable rows above the viewport perfectly synchronized.
 *
 * `clear` remains the full terminal reset for the explicit "wipe and start
 * over" path.
 */
export function getResetSequenceForReason(reason: FlickerReason): string {
  return reason !== 'clear'
    ? getClearVisibleTerminalSequence()
    : getClearTerminalSequence()
}

/**
 * Clears the terminal screen. On supported terminals, also clears scrollback.
 */
export const clearTerminal = getClearTerminalSequence()
