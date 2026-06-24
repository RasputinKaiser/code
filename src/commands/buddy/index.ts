import type { Command } from '../../commands.js'
import { isBuddyLive } from '../../buddy/useBuddyNotification.js'

const command: Command = {
  type: 'local-jsx',
  name: 'buddy',
  description: 'Hatch a coding companion · pet, off',
  isHidden: !isBuddyLive(),
  immediate: true,
  load: () => import('./buddy.js'),
}

export default command
