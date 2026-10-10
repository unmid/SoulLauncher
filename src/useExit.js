import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Drives an enter→exit animation for popups. Call `close()` instead of
 * unmounting immediately: it flips `closing` to true (so the CSS exit
 * animation runs), then calls `onClosed` when the animation is done.
 * Looks alive instead of popping in and out statically.
 */
export function useExit(onClosed, ms = 150) {
  const [closing, setClosing] = useState(false)
  const timer = useRef(null)

  const close = useCallback(() => {
    if (timer.current) return
    setClosing(true)
    timer.current = setTimeout(() => {
      timer.current = null
      onClosed?.()
    }, ms)
  }, [onClosed, ms])

  useEffect(() => () => clearTimeout(timer.current), [])

  return { closing, close }
}