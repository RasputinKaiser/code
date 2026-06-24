/**
 * Worktree mode is now unconditionally enabled for all users.
 *
 * Previously gated by GrowthBook flag 'ncode_worktree_mode', but the
 * CACHED_MAY_BE_STALE pattern returns the default (false) on first launch
 * before the cache is populated, silently swallowing --worktree.
 * See upstream issue context in source history.
 */
export function isWorktreeModeEnabled(): boolean {
  return true
}
