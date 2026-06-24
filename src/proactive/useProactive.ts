import { useEffect } from 'react'

type UseProactiveOptions = {
  isLoading: boolean
  queuedCommandsLength: number
  hasActiveLocalJsxUI: boolean
  isInPlanMode: boolean
  onSubmitTick: (prompt: string) => void
  onQueueTick: (prompt: string) => void
}

export function useProactive(_options: UseProactiveOptions): void {
  useEffect(() => undefined, [])
}
