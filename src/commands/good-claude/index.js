import { createUnrecoveredLocalCommand } from '../unrecoveredCommand.js'

const goodNcode = createUnrecoveredLocalCommand({
  name: 'good-ncode',
  description: 'Send a positive feedback signal',
})

export default {
  ...goodNcode,
  aliases: ['good-claude'],
}
