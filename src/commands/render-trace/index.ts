import type { Command } from '../../commands.js'

const renderTrace: Command = {
  type: 'local',
  name: 'render-trace',
  description: 'Dump render trace for terminal corruption diagnostics',
  isHidden: true,
  supportsNonInteractive: true,
  load: () => import('./render-trace.js'),
}

export default renderTrace
