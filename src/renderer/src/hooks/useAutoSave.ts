import { useCallback, useEffect, useRef, useState } from 'react'
import type { PostUpdate } from '@shared/types'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface UseAutoSaveReturn {
  status: SaveStatus
  flush: () => Promise<void>
}

export function useAutoSave(update: PostUpdate | null, delay = 1000): UseAutoSaveReturn {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef<string>('')
  const updateRef = useRef(update)
  const freshRef = useRef(true)
  updateRef.current = update

  const save = useCallback(async (data: PostUpdate) => {
    const serialized = JSON.stringify(data)

    // First call after a post ID change: snapshot without saving
    if (freshRef.current) {
      lastSavedRef.current = serialized
      freshRef.current = false
      return
    }

    if (serialized === lastSavedRef.current) return

    // Don't save blank posts (no title and no content)
    if (!data.title?.trim() && !data.content?.trim()) return

    try {
      setStatus('saving')
      await window.electronAPI.updatePost(data)
      lastSavedRef.current = serialized
      setStatus('saved')
    } catch {
      setStatus('error')
    }
  }, [])

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (updateRef.current) {
      await save(updateRef.current)
    }
  }, [save])

  useEffect(() => {
    if (!update) return

    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      save(update)
    }, delay)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [update, delay, save])

  // Reset saved snapshot when post ID changes
  const prevIdRef = useRef(update?.id)
  useEffect(() => {
    if (update?.id !== prevIdRef.current) {
      lastSavedRef.current = ''
      freshRef.current = true
      setStatus('idle')
      prevIdRef.current = update?.id
    }
  }, [update?.id])

  return { status, flush }
}
