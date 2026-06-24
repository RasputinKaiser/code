import { useEffect, useRef, type MutableRefObject } from 'react'
import {
  getTerminalFocused,
  subscribeTerminalFocus,
} from '../terminal-focus-state.js'

export function useTerminalFocusRef(): MutableRefObject<boolean> {
  const focusRef = useRef(getTerminalFocused())

  useEffect(
    () =>
      subscribeTerminalFocus(() => {
        focusRef.current = getTerminalFocused()
      }),
    [],
  )

  return focusRef
}
