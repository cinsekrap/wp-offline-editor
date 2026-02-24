import { useEffect, useRef } from 'react'

export function useAutoSync(
  enabled: boolean,
  online: boolean,
  onPull: () => Promise<void>,
  intervalMinutes: number = 5
): void {
  const onPullRef = useRef(onPull)
  onPullRef.current = onPull

  useEffect(() => {
    if (!enabled || !online || intervalMinutes <= 0) return

    const interval = setInterval(() => {
      onPullRef.current().catch(() => {
        // Auto-sync failures are non-critical
      })
    }, intervalMinutes * 60 * 1000)

    return () => clearInterval(interval)
  }, [enabled, online, intervalMinutes])
}
