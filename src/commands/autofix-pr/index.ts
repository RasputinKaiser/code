import type { Command } from '../../commands.js'

const autofixPr = {
  type: 'local-jsx',
  name: 'autofix-pr',
  description:
    'Watch the current PR and push fixes for CI failures or review comments',
  availability: ['claude-ai'],
  argumentHint: '[prompt]',
  load: () => import('./autofix-pr.js'),
} satisfies Command

export default autofixPr
