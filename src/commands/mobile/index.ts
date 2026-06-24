import type { Command } from '../../commands.js'

const mobile = {
  type: 'local-jsx',
  name: 'mobile',
  aliases: ['ios', 'android'],
  description: 'Show QR code to open the mobile app download page',
  load: () => import('./mobile.js'),
} satisfies Command

export default mobile
