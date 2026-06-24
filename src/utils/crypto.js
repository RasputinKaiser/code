import { randomUUID as nodeRandomUUID } from 'crypto'

export function randomUUID() {
  return nodeRandomUUID()
}
