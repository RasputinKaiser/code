import type { Command } from '../../commands.js'
import { isInternalBuild } from '../../capabilities/index.js'

const tag = {
  type: 'local-jsx',
  name: 'tag',
  description: 'Toggle a searchable tag on the current session',
  isEnabled: () => isInternalBuild(),
  argumentHint: '<tag-name>',
  load: () => import('./tag.js'),
} satisfies Command

export default tag
