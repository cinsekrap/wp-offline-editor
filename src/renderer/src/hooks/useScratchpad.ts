import { useState, useEffect, useRef, useCallback } from 'react'
import type { Scratchpad, ScratchpadInput } from '@shared/types'

export type ScratchpadSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface UseScratchpadReturn {
  scratchpad: Scratchpad | null
  loading: boolean
  allScratchpads: Scratchpad[]
  title: string
  content: string
  setTitle: (v: string) => void
  setContent: (v: string) => void
  saveStatus: ScratchpadSaveStatus
  create: (title: string) => Promise<void>
  link: (scratchpadId: string) => Promise<void>
  unlink: () => Promise<void>
  refresh: () => Promise<void>
}

export function useScratchpad(siteId: string, postId: string): UseScratchpadReturn {
  const [scratchpad, setScratchpad] = useState<Scratchpad | null>(null)
  const [allScratchpads, setAllScratchpads] = useState<Scratchpad[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saveStatus, setSaveStatus] = useState<ScratchpadSaveStatus>('idle')

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef('')
  const freshRef = useRef(true)
  const scratchpadIdRef = useRef<string | null>(null)

  const loadLinked = useCallback(async () => {
    setLoading(true)
    try {
      const post = await window.electronAPI.getPost(postId)
      if (post?.scratchpad_id) {
        const sp = await window.electronAPI.getScratchpad(post.scratchpad_id)
        setScratchpad(sp)
        if (sp) {
          setTitle(sp.title)
          setContent(sp.content)
          scratchpadIdRef.current = sp.id
          freshRef.current = true
          lastSavedRef.current = ''
        }
      } else {
        setScratchpad(null)
        setTitle('')
        setContent('')
        scratchpadIdRef.current = null
      }
    } finally {
      setLoading(false)
    }
  }, [postId])

  const loadAll = useCallback(async () => {
    const list = await window.electronAPI.getScratchpads(siteId)
    setAllScratchpads(list)
  }, [siteId])

  // Initial load
  useEffect(() => {
    freshRef.current = true
    lastSavedRef.current = ''
    setSaveStatus('idle')
    loadLinked()
    loadAll()
  }, [postId, siteId, loadLinked, loadAll])

  // Auto-save with 1500ms debounce
  useEffect(() => {
    if (!scratchpadIdRef.current) return

    const id = scratchpadIdRef.current
    const serialized = JSON.stringify({ title, content })

    // First change after load: snapshot without saving
    if (freshRef.current) {
      lastSavedRef.current = serialized
      freshRef.current = false
      return
    }

    if (serialized === lastSavedRef.current) return

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      try {
        setSaveStatus('saving')
        await window.electronAPI.updateScratchpad({ id, title, content })
        lastSavedRef.current = serialized
        setSaveStatus('saved')
      } catch (err) {
        console.error('[scratchpad] Auto-save failed:', err instanceof Error ? err.message : err)
        setSaveStatus('error')
      }
    }, 1500)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [title, content])

  const create = useCallback(
    async (newTitle: string) => {
      const input: ScratchpadInput = { site_id: siteId, title: newTitle }
      const sp = await window.electronAPI.createScratchpad(input)
      await window.electronAPI.linkScratchpad(postId, sp.id)
      setScratchpad(sp)
      setTitle(sp.title)
      setContent(sp.content)
      scratchpadIdRef.current = sp.id
      freshRef.current = true
      lastSavedRef.current = ''
      setSaveStatus('idle')
      await loadAll()
    },
    [siteId, postId, loadAll]
  )

  const link = useCallback(
    async (scratchpadId: string) => {
      await window.electronAPI.linkScratchpad(postId, scratchpadId)
      const sp = await window.electronAPI.getScratchpad(scratchpadId)
      setScratchpad(sp)
      if (sp) {
        setTitle(sp.title)
        setContent(sp.content)
        scratchpadIdRef.current = sp.id
        freshRef.current = true
        lastSavedRef.current = ''
        setSaveStatus('idle')
      }
    },
    [postId]
  )

  const unlink = useCallback(async () => {
    // Flush pending save
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (scratchpadIdRef.current) {
      const serialized = JSON.stringify({ title, content })
      if (serialized !== lastSavedRef.current) {
        try {
          await window.electronAPI.updateScratchpad({
            id: scratchpadIdRef.current,
            title,
            content
          })
        } catch {
          // Best effort
        }
      }
    }

    await window.electronAPI.unlinkScratchpad(postId)
    setScratchpad(null)
    setTitle('')
    setContent('')
    scratchpadIdRef.current = null
    setSaveStatus('idle')
  }, [postId, title, content])

  const refresh = useCallback(async () => {
    await loadLinked()
    await loadAll()
  }, [loadLinked, loadAll])

  return {
    scratchpad,
    loading,
    allScratchpads,
    title,
    content,
    setTitle,
    setContent,
    saveStatus,
    create,
    link,
    unlink,
    refresh
  }
}
