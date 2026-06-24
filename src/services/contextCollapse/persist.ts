import type {
  ContextCollapseCommitEntry,
  ContextCollapseSnapshotEntry,
} from '../../types/logs.js'
import { resetContextCollapse } from './index.js'

export function restoreFromEntries(
  _commits: ContextCollapseCommitEntry[],
  _snapshot: ContextCollapseSnapshotEntry | undefined,
): void {
  resetContextCollapse()
}
