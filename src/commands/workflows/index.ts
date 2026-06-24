import type { Command } from '../../commands.js'

const workflows = {
  type: 'local',
  name: 'workflows',
  description: 'List and inspect workflow commands',
  load: () => import('./workflows.js'),
} satisfies Command

export default workflows
