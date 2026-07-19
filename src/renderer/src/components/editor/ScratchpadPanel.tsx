import { useState, useEffect } from 'react'
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Plus,
  Link2,
  Unlink,
  Search,
  MoreHorizontal,
  ExternalLink,
  Pencil,
  AlertTriangle
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { useScratchpad, type ScratchpadSaveStatus } from '@renderer/hooks/useScratchpad'
import { ScratchpadEditor } from './ScratchpadEditor'
import { ScratchpadConflictBanner } from './ScratchpadConflictBanner'
import { cn } from '@renderer/lib/utils'

interface ScratchpadPanelProps {
  siteId: string
  postId: string
}

function ScratchpadSaveIndicator({ status }: { status: ScratchpadSaveStatus }): JSX.Element | null {
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

export function ScratchpadPanel({ siteId, postId }: ScratchpadPanelProps): JSX.Element {
  const {
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
  } = useScratchpad(siteId, postId)

  const [mode, setMode] = useState<'idle' | 'creating' | 'picking'>('idle')
  const [newTitle, setNewTitle] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [poppedOut, setPoppedOut] = useState(false)

  // Check if scratchpad window is already open on mount, and listen for open/close
  useEffect(() => {
    if (!scratchpad) {
      setPoppedOut(false)
      return
    }

    window.electronAPI.isScratchpadWindowOpen(scratchpad.id).then(setPoppedOut)

    const cleanup = window.electronAPI.onScratchpadWindowStatus((id, open) => {
      if (id !== scratchpad.id) return
      setPoppedOut(open)
      // Reload content when pop-out closes — edits may have happened there
      if (!open) refresh()
    })
    return cleanup
  }, [scratchpad?.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ── Linked state ──
  if (scratchpad) {
    // ── Popped out ──
    if (poppedOut) {
      return (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-1 px-3 py-2 border-b shrink-0">
            {scratchpad.conflict && (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" aria-label="Has a conflict" />
            )}
            <span className="text-sm font-medium truncate flex-1">
              {title || 'Untitled'}
            </span>
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Scratchpad options">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-40 p-1">
                <button
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm text-destructive hover:bg-accent transition-colors"
                  onClick={() => {
                    setMenuOpen(false)
                    unlink()
                  }}
                >
                  <Unlink className="h-3.5 w-3.5" />
                  Unlink
                </button>
              </PopoverContent>
            </Popover>
          </div>
          {scratchpad.conflict && (
            <ScratchpadConflictBanner scratchpadId={scratchpad.id} onResolved={refresh} />
          )}
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
            <ExternalLink className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              Open in another window
            </p>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => window.electronAPI.openScratchpadWindow(scratchpad.id)}
            >
              Focus window
            </Button>
          </div>
        </div>
      )
    }

    // ── Inline editor ──
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-1 px-3 py-2 border-b shrink-0">
          {editingTitle ? (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Scratchpad title"
              className="h-7 text-sm flex-1"
              autoFocus
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') setEditingTitle(false)
              }}
            />
          ) : (
            <span className="text-sm font-medium truncate flex-1">
              {title || 'Untitled'}
            </span>
          )}
          <ScratchpadSaveIndicator status={saveStatus} />
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Scratchpad options">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-40 p-1">
              <button
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors"
                onClick={() => {
                  setMenuOpen(false)
                  setEditingTitle(true)
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Rename
              </button>
              <button
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm text-destructive hover:bg-accent transition-colors"
                onClick={() => {
                  setMenuOpen(false)
                  unlink()
                }}
              >
                <Unlink className="h-3.5 w-3.5" />
                Unlink
              </button>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            title="Pop out"
            onClick={() => window.electronAPI.openScratchpadWindow(scratchpad.id)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
        {scratchpad.conflict && (
          <ScratchpadConflictBanner scratchpadId={scratchpad.id} onResolved={refresh} />
        )}
        <div className="flex-1 min-h-0 px-3 pb-2">
          <ScratchpadEditor
            key={scratchpad.id}
            content={content}
            onChange={setContent}
          />
        </div>
      </div>
    )
  }

  // ── Creating state ──
  if (mode === 'creating') {
    return (
      <div className="p-4 space-y-3">
        <p className="text-sm text-muted-foreground">Create a new scratchpad</p>
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Scratchpad title"
          className="h-8 text-sm"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newTitle.trim()) {
              create(newTitle.trim())
              setNewTitle('')
              setMode('idle')
            }
            if (e.key === 'Escape') setMode('idle')
          }}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            disabled={!newTitle.trim()}
            onClick={() => {
              create(newTitle.trim())
              setNewTitle('')
              setMode('idle')
            }}
          >
            Create
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setNewTitle('')
              setMode('idle')
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  // ── Picking existing state ──
  if (mode === 'picking') {
    const filtered = allScratchpads.filter((s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
      <div className="flex flex-col h-full">
        <div className="p-3 space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Use existing scratchpad</span>
            <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search scratchpads..."
              className="h-7 text-xs pl-7"
              autoFocus
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground text-center">
              {allScratchpads.length === 0 ? 'No scratchpads yet' : 'No matches'}
            </p>
          ) : (
            <div className="px-2 pb-2 space-y-1">
              {filtered.map((sp) => (
                <button
                  key={sp.id}
                  className={cn(
                    'w-full text-left px-2 py-1.5 rounded-md text-sm',
                    'hover:bg-accent transition-colors'
                  )}
                  onClick={() => {
                    link(sp.id)
                    setSearchQuery('')
                    setMode('idle')
                  }}
                >
                  <div className="flex items-center gap-1.5 font-medium truncate">
                    {sp.conflict && (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    )}
                    <span className="truncate">{sp.title || 'Untitled'}</span>
                  </div>
                  {sp.content && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {sp.content.slice(0, 80)}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Empty state ──
  return (
    <div className="p-4 space-y-3">
      <p className="text-sm text-muted-foreground text-center py-4">
        No scratchpad linked to this post.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setMode('creating')}
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        New Scratchpad
      </Button>
      {allScratchpads.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setMode('picking')}
        >
          <Link2 className="h-3.5 w-3.5 mr-1.5" />
          Use Existing
        </Button>
      )}
    </div>
  )
}
