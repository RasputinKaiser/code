import type { Command } from '../../commands.js'

const assistant = {
  type: 'local-jsx',
  name: 'assistant',
  description: 'Discover and attach to a running assistant session',
  load: () => import('./assistant.js'),
} satisfies Command

export default assistant
