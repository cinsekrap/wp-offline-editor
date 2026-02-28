import '@renderer/styles/globals.css'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { Input } from '@renderer/components/ui/input'
import { ScratchpadEditor } from './ScratchpadEditor'
import type { Scratchpad, AppSettings } from '@shared/types'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

function SaveIndicator({ status }: { status: SaveStatus }): JSX.Element | null {
  switch (status) {
    case 'saving':
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving...
        </span>
      )
    case 'saved':
      return (
        <span className="flex items-center gap-1 text-xs text-green-600">
          <CheckCircle className="h-3 w-3" />
          Saved
        </span>
      )
    case 'error':
      return (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          Error
        </span>
      )
    default:
      return null
  }
}

export function ScratchpadWindow({ scratchpadId }: { scratchpadId: string }): JSX.Element {
  const [scratchpad, setScratchpad] = useState<Scratchpad | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef('')
  const freshRef = useRef(true)

  // Apply theme
  useEffect(() => {
    let cleanup: (() => void) | undefined
    window.electronAPI.getSettings().then((settings: AppSettings) => {
      const root = document.documentElement
      function applyTheme(dark: boolean): void {
        if (dark) root.classList.add('dark')
        else root.classList.remove('dark')
      }
      if (settings.theme === 'dark') {
        applyTheme(true)
        return
      }
      if (settings.theme === 'light') {
        applyTheme(false)
        return
      }
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      applyTheme(mq.matches)
      const handler = (e: MediaQueryListEvent): void => applyTheme(e.matches)
      mq.addEventListener('change', handler)
      cleanup = () => mq.removeEventListener('change', handler)
    })
    return () => cleanup?.()
  }, [])

  // Load scratchpad
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const sp = await window.electronAPI.getScratchpad(scratchpadId)
      if (!sp) {
        setNotFound(true)
        return
      }
      setScratchpad(sp)
      setTitle(sp.title)
      setContent(sp.content)
      freshRef.current = true
      lastSavedRef.current = ''
    } finally {
      setLoading(false)
    }
  }, [scratchpadId])

  useEffect(() => {
    load()
  }, [load])

  // Cross-window sync
  useEffect(() => {
    const cleanup = window.electronAPI.onScratchpadChanged(async (changedId: string) => {
      if (changedId !== scratchpadId) return
      try {
        const sp = await window.electronAPI.getScratchpad(scratchpadId)
        if (!sp) return

        const currentSerialized = JSON.stringify({ title, content })
        const remoteSerialized = JSON.stringify({ title: sp.title, content: sp.content })

        if (remoteSerialized !== currentSerialized) {
          setTitle(sp.title)
          setContent(sp.content)
          lastSavedRef.current = remoteSerialized
          freshRef.current = true
        }
      } catch {
        // Ignore
      }
    })
    return cleanup
  }, [scratchpadId, title, content])

  // Auto-save with 1500ms debounce
  useEffect(() => {
    if (!scratchpad) return

    const serialized = JSON.stringify({ title, content })

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
        await window.electronAPI.updateScratchpad({ id: scratchpadId, title, content })
        lastSavedRef.current = serialized
        setSaveStatus('saved')
      } catch (err) {
        console.error('[scratchpad-window] Auto-save failed:', err instanceof Error ? err.message : err)
        setSaveStatus('error')
      }
    }, 1500)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [scratchpad, scratchpadId, title, content])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background gap-3">
        <p className="text-sm text-muted-foreground">Scratchpad not found</p>
        <button
          className="text-sm text-primary hover:underline"
          onClick={() => window.close()}
        >
          Close window
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Drag region for hidden title bar */}
      <div className="h-10 shrink-0 drag-region" />

      <div className="flex items-center gap-2 px-4 pb-2 shrink-0">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Scratchpad title"
          className="h-8 text-sm font-medium flex-1"
        />
        <SaveIndicator status={saveStatus} />
      </div>

      <div className="flex-1 min-h-0 px-4 pb-4">
        <ScratchpadEditor
          key={scratchpadId}
          content={content}
          onChange={setContent}
        />
      </div>
    </div>
  )
}
