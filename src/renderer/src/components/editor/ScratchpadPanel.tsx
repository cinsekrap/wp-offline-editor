import { useState } from 'react'
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Plus,
  Link2,
  Unlink,
  Search
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { useScratchpad, type ScratchpadSaveStatus } from '@renderer/hooks/useScratchpad'
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
    unlink
  } = useScratchpad(siteId, postId)

  const [mode, setMode] = useState<'idle' | 'creating' | 'picking'>('idle')
  const [newTitle, setNewTitle] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ── Linked state ──
  if (scratchpad) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-3 space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Linked scratchpad</span>
            <ScratchpadSaveIndicator status={saveStatus} />
          </div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Scratchpad title"
            className="h-8 text-sm"
          />
        </div>
        <div className="flex-1 min-h-0 px-3 pb-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write notes here... (markdown)"
            className={cn(
              'w-full h-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm',
              'font-mono leading-relaxed',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              'placeholder:text-muted-foreground'
            )}
          />
        </div>
        <div className="p-3 border-t shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground hover:text-destructive"
            onClick={unlink}
          >
            <Unlink className="h-3 w-3 mr-1" />
            Unlink scratchpad
          </Button>
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
                  <div className="font-medium truncate">{sp.title || 'Untitled'}</div>
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
