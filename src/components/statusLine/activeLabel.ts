import type { AppState } from '../../state/AppStateStore.js'
import { getViewedTeammateTask } from '../../state/selectors.js'

const DEFAULT_ACTIVE_LABEL = 'Main'

type StatusLineActiveLabelState = Pick<
  AppState,
  'viewingAgentTaskId' | 'tasks' | 'agentNameRegistry'
>

export function getStatusLineActiveLabel(
  state: AppState | StatusLineActiveLabelState,
): string {
  const viewedTeammate = getViewedTeammateTask(state)
  if (viewedTeammate) {
    return `@${viewedTeammate.identity.agentName}`
  }

  if (state.viewingAgentTaskId) {
    const task = state.tasks[state.viewingAgentTaskId]
    if (task?.type === 'local_agent') {
      for (const [name, agentId] of state.agentNameRegistry) {
        if (agentId === task.id) {
          return `@${name}`
        }
      }

      return `@${task.agentType}`
    }
  }

  return DEFAULT_ACTIVE_LABEL
}
