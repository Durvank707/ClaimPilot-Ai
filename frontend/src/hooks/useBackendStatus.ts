import { useCallback, useEffect, useRef, useState } from 'react'
import { checkBackend, type ConnectionResult } from '../api/connection'

export type BackendStatus = { phase: 'checking' } | ConnectionResult

/**
 * Checks backend connectivity once on mount and exposes a manual `refresh`.
 *
 * Deliberately does not poll on an interval: checks happen on mount and when
 * the caller invokes `refresh`. Stale responses are discarded via a request
 * counter so a slow earlier check cannot overwrite a newer one.
 */
export function useBackendStatus() {
  const [status, setStatus] = useState<BackendStatus>({ phase: 'checking' })
  const requestId = useRef(0)
  const mounted = useRef(true)

  // Runs a check and applies the result only if it is still the newest one.
  // Does not set the "checking" state synchronously, so it is safe to call
  // from an effect without triggering a cascading render.
  const runCheck = useCallback(async () => {
    const id = requestId.current + 1
    requestId.current = id

    const result = await checkBackend()
    if (!mounted.current || id !== requestId.current) return
    setStatus(result)
  }, [])

  // Manual re-check: show the loading state immediately, from the event.
  const refresh = useCallback(async () => {
    setStatus({ phase: 'checking' })
    await runCheck()
  }, [runCheck])

  useEffect(() => {
    mounted.current = true
    void runCheck()
    return () => {
      mounted.current = false
    }
  }, [runCheck])

  return { status, refresh }
}
