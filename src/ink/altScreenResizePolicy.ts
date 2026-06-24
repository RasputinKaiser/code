export type AltScreenRepaintMode =
  | 'none'
  | 'erase-before-paint'
  | 'repaint-from-home'

/**
 * Width changes need special handling in alt-screen mode because the repaint
 * writes only visible cells; old-width line tails can otherwise remain on the
 * physical terminal. When synchronized output is available we can keep the
 * existing erase+paint path because it lands atomically. Without synchronized
 * output, prefer a row-wise home repaint so unsupported terminals and tmux do
 * not show a full blank frame between erase and paint.
 */
export function getAltScreenResizeRepaintMode(
  prevWidth: number,
  nextWidth: number,
  synchronizedOutputSupported: boolean,
): AltScreenRepaintMode {
  if (prevWidth === nextWidth) {
    return 'none'
  }

  return synchronizedOutputSupported
    ? 'erase-before-paint'
    : 'repaint-from-home'
}

/**
 * Alt-screen recovery (SIGCONT, sleep/wake, fullscreen editor return) uses the
 * same repaint choice as width-resize recovery, except the previous physical
 * contents are no longer trustworthy. Synchronized terminals can still erase
 * atomically during the next paint; unsupported terminals should repaint from
 * home row-by-row so recovery does not flash blank first.
 */
export function getAltScreenRecoveryRepaintMode(
  synchronizedOutputSupported: boolean,
): Exclude<AltScreenRepaintMode, 'none'> {
  return synchronizedOutputSupported
    ? 'erase-before-paint'
    : 'repaint-from-home'
}
