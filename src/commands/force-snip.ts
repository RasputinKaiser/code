import { createUnrecoveredLocalCommand } from './unrecoveredCommand.js'

export default createUnrecoveredLocalCommand({
  name: 'force-snip',
  description: 'Force history snipping for the current session',
})
