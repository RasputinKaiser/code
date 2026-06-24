import type { Command } from '../../commands.js'

const repaint = {
  type: 'local',
  name: 'repaint',
  aliases: ['redraw'],
  description:
    'Force a terminal repaint and write a bounded renderer diagnostic artifact',
  isHidden: true,
  supportsNonInteractive: false,
  load: () => import('./repaint.js'),
} satisfies Command

export default repaint
