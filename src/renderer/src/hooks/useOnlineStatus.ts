import { useState, useEffect, useCallback, useRef } from 'react'

interface OnlineStatus {
  online: boolean
  justReconnected: boolean
  clearReconnected: () => void
}

export function useOnlineStatus(): OnlineStatus {
  const [online, setOnline] = useState(navigator.onLine)
  const [justReconnected, setJustReconnected] = useState(false)
  const wasOfflineRef = useRef(false)

  useEffect(() => {
    function handleOnline(): void {
      setOnline(true)
      if (wasOfflineRef.current) {
        setJustReconnected(true)
      }
      wasOfflineRef.current = false
    }

    function handleOffline(): void {
      setOnline(false)
      wasOfflineRef.current = true
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const clearReconnected = useCallback(() => {
    setJustReconnected(false)
  }, [])

  return { online, justReconnected, clearReconnected }
}
