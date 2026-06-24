import { createUnrecoveredLocalCommand } from '../unrecoveredCommand.js'

export default createUnrecoveredLocalCommand({
  name: 'backfill-sessions',
  description: 'Backfill session ingress data',
})
